import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { PostgresDatabase } from "../../src/data/postgres";
import { DashboardPostgresDatasource } from "../../src/infrastructure/datasources/dashboard/dashboard.datasource.postgres";
import { AppRoutes } from "../../src/presentation/routes/routes";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";

const source = new DashboardPostgresDatasource();
const tag = `dashboard-${randomUUID()}`;
const from = Date.parse("2026-10-15T06:00:00Z"), to = from+86_400_000, now=from+12*3_600_000;
let a:string,b:string,userId:string,profileId:string;
let server:Server, base:string, token:string;
beforeAll(async()=>{
  const db=await PostgresDatabase.connect({databaseUrl:process.env.DATABASE_URL!});
  a=(await db.proyecto.create({data:{nombre:"Dashboard A",ciudad:"CDMX",identificador:tag+"a",coordinates:[0,0]}})).id;
  b=(await db.proyecto.create({data:{nombre:"Dashboard B",ciudad:"CDMX",identificador:tag+"b",coordinates:[0,0]}})).id;
  profileId=(await db.permissionProfile.create({data:{app:"ADMIN_WEB",nombre:tag,modules:["payments"]}})).id;
  userId=(await db.usuario.create({data:{nombre:"Admin",apellido:"Dashboard",correo:tag+"@example.test",telefono:tag,password:"unused",emailValidated:true,rol:"ADMIN_ROLE",allowedApps:["ADMIN_WEB"],parkings:{create:{proyectoId:a}},appPermissions:{create:{app:"ADMIN_WEB",permissionProfileId:profileId}}}})).id;
  const plan=await db.pension.create({data:{proyectoId:a,nombre:tag,precio:20}});
  const pass=await db.pensionPass.create({data:{pensionId:plan.id,usuarioId:userId,name:tag,idPass:tag,vigent:true,validFrom:new Date(now-10000),validTo:new Date(now+86_400_000)}});
  await db.pensionPass.create({data:{pensionId:plan.id,name:tag,idPass:tag+"inventory",vigent:false,estado:true}});
  const expiredPlan=await db.pension.create({data:{proyectoId:a,nombre:tag,precio:20}});
  await db.pensionPass.create({data:{pensionId:expiredPlan.id,usuarioId:userId,name:tag,idPass:tag+"expired",vigent:true,validFrom:new Date(now-20000),validTo:new Date(now-1)}});
  // A refund counts on its own date (here, inside the period), not the charge's.
  const payment=async(project:string|null,amount:number,reference:string,status:"succeeded"|"pending"|"refunded"="succeeded",paidAt=from+1000,passId?:string)=>db.payment.create({data:{usuarioId:userId,type:passId?"pension":"ticket",concept:tag,amount,currency:"MXN",status,paidAt:new Date(paidAt),refundedAt:status==="refunded"?new Date(from+2000):null,stripePaymentIntentId:reference,referenceType:passId?"pension":"ticket",referenceId:passId??randomUUID(),proyectoId:project}});
  await payment(a,100,tag+"stripe"); await payment(a,900,tag+"pending","pending");
  await payment(b,777,tag+"other"); await payment(a,40,tag+"previous","succeeded",from-1000);
  await payment(a,90,tag+"refund","refunded"); await payment(null,20,tag+"pension","succeeded",from+1000,pass.id);
  // Mirror rows as the inbox processor stores them: payload plus its typed columns.
  const mirror=async(project:string,reference:string,amount:number,currency="MXN")=>db.operationalPayment.create({data:{proyectoId:project,installationId:tag,aggregateId:randomUUID(),occurredAt:new Date(now),eventId:randomUUID(),payload:{id:randomUUID(),provider_reference:reference,amount,status:"succeeded",currency,paid_at:new Date(from+1000).toISOString()},
    paidAt:new Date(from+1000),amount,currency,status:"succeeded",paymentType:"ticket",providerReference:reference,method:reference.startsWith("pos_session_")?"efectivo":reference.startsWith("pi_")?"tarjeta":"sin_identificar"}});
  await mirror(a,tag+"stripe",100); await mirror(a,"pos_session_"+tag,50);
  await mirror(a,tag+"refund",90); await mirror(a,tag+"usd",500,"USD"); await mirror(b,tag+"foreign",777);
  await db.operationalTicket.create({data:{proyectoId:a,installationId:tag,aggregateId:randomUUID(),occurredAt:new Date(now),eventId:randomUUID(),payload:{hora_inicio:new Date(from-3_600_000).toISOString(),hora_salida:new Date(from+3_600_000).toISOString(),pagado:true,monto:"150.00"},
    horaInicio:new Date(from-3_600_000),horaSalida:new Date(from+3_600_000),pagado:true,monto:"150.00"}});
  await db.operationalTicket.create({data:{proyectoId:a,installationId:tag,aggregateId:randomUUID(),occurredAt:new Date(now),eventId:randomUUID(),payload:{hora_inicio:new Date(from+2*3_600_000).toISOString(),hora_salida:null,pagado:false,monto:"0"},
    horaInicio:new Date(from+2*3_600_000),horaSalida:null,pagado:false,monto:"0"}});
  await db.localInstallation.create({data:{installationId:tag,proyectoId:a,status:"approved",lastCommandPollAt:new Date(now-1000)}});
  const module=await db.modulo.create({data:{proyectoId:a,nombre:tag,tipo:"ENTRADA",identificador:tag,deviceState:{create:{syncedAt:new Date(now),isConnected:true,isAuthorized:true,lastHeartbeatAt:new Date(now-1000)}}}});
  expect(module.id).toBeTruthy();
  await db.operationalIncident.create({data:{incidentKey:tag,type:"INSTALLATION_OFFLINE",status:"open",severity:"warning",source:"test",proyectoId:a,message:"Real incident",openedAt:new Date(from+1000),lastSeenAt:new Date(from+1000)}});
  token=String(await JwtPlugin.generateToken({id:userId,app:"ADMIN_WEB"}));
  const app=express(); app.use(express.json());app.use(AppRoutes.routes);
  server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{
  if(server) await new Promise<void>(resolve=>server.close(()=>resolve()));
  const db=PostgresDatabase.client;
  await db.operationalIncident.deleteMany({where:{incidentKey:tag}});
  await db.payment.deleteMany({where:{concept:tag}});
  await db.pensionPass.deleteMany({where:{idPass:{startsWith:tag}}});
  await db.pension.deleteMany({where:{nombre:tag}});
  await db.modulo.deleteMany({where:{identificador:tag}});
  await db.localInstallation.deleteMany({where:{installationId:tag}});
  await db.usuario.deleteMany({where:{id:userId}});await db.permissionProfile.deleteMany({where:{id:profileId}});
  await db.proyecto.deleteMany({where:{id:{in:[a,b]}}});await PostgresDatabase.disconnect();
});
describe("dashboard consolidated PostgreSQL data",()=>{
  it("deduplicates Stripe mirrors, excludes pending/refunded/foreign currency and scopes projects",async()=>{
    const result=await source.getMetrics([a],from,to,now);
    expect(result.totalRevenue).toBe(170);expect(result.revenueChangePercent).toBe(325);
    expect(result.paymentMethods.find(p=>p.method==="Efectivo")?.amount).toBe(50);
    expect(result.paymentMethods.find(p=>p.method==="Tarjeta")?.amount).toBe(120);
    expect(result.revenueTrend).toEqual([{label:"2026-10-15",amount:170}]);
  });
  it("uses exited ticket timestamps and keeps entry/exit hours separate",async()=>{
    const result=await source.getMetrics([a],from,to,now);
    expect(result.avgStayDurationLabel).toBe("2h 0m");expect(result.avgTicketRevenue).toBe(150);
    expect(result.hourlyPeaks).toEqual([{hourLabel:"01:00",entries:0,exits:1},{hourLabel:"02:00",entries:1,exits:0}]);
    expect(result.stayRangesBreakdown.find(r=>r.rangeLabel==="1 - 3 Horas")?.revenue).toBe(150);
  });
  it("does not count free inventory or expired passes and never invents capacity or pulses",async()=>{
    const result=await source.getMetrics([a,b],from,to,now);
    expect(result.activePensionsCount).toBe(1);expect(result.pensionsExpiringSoonCount).toBe(1);
    expect(result.occupancyPercent).toBeNull();
    expect(result.healthProjects.find(p=>p.id===a)).toMatchObject({status:"online",activeDevicesCount:1,totalDevicesCount:1});
    expect(result.healthProjects.find(p=>p.id===b)).toMatchObject({status:"unlinked",lastHeartbeatAt:null});
    expect(result.auditEvents).toHaveLength(1);expect(result.auditEvents[0].description).toBe("Real incident");
    expect((await source.getMetrics([a],from,to,now+120000)).healthProjects[0]).toMatchObject({status:"offline",activeDevicesCount:0});
  });
  it("returns real zeroes, empty series and null averages for an empty scope",async()=>{
    const result=await source.getMetrics([],from,to,now);
    expect(result).toMatchObject({totalRevenue:0,revenueChangePercent:null,avgTicketRevenue:null,avgStayDurationLabel:"Sin datos",activePensionsCount:0,healthProjects:[],auditEvents:[],hourlyPeaks:[],paymentMethods:[],revenueTrend:[]});
  });
  it("enforces authentication, project authorization and valid periods over HTTP",async()=>{
    const query=`?from=${from}&to=${to}`;
    expect((await fetch(base+"/api/dashboard"+query)).status).toBe(401);
    const headers={Authorization:`Bearer ${token}`};
    const response=await fetch(base+"/api/dashboard"+query,{headers});expect(response.status).toBe(200);
    expect(((await response.json()) as {totalRevenue:number}).totalRevenue).toBe(170);
    expect((await fetch(base+"/api/dashboard"+query+`&projectId=${b}`,{headers})).status).toBe(403);
    expect((await fetch(base+`/api/dashboard?from=${to}&to=${from}`,{headers})).status).toBe(400);
  });
});
