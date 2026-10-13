export const emailTheme = {
  light: {
    page: "#eef2ef",
    card: "#ffffff",
    border: "#dfe8e2",
    title: "#17201b",
    body: "#526158",
    muted: "#718078",
    surface: "#f4f7f5",
    callout: "#f0f7f2",
  },
  dark: {
    page: "#0d1210",
    card: "#17201b",
    border: "#33443a",
    title: "#f4f8f5",
    body: "#c7d2cb",
    muted: "#9baba1",
    surface: "#202c25",
    callout: "#1d3023",
  },
  brand: {
    header: "#102019",
    accent: "#2f7d46",
    accentText: "#a9e995",
    link: "#28673c",
    darkLink: "#8ddb9f",
  },
} as const;

export const emailThemeStyles = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .email-page { background-color:${emailTheme.dark.page} !important; }
    .email-card { background-color:${emailTheme.dark.card} !important; border-color:${emailTheme.dark.border} !important; }
    .email-title, .email-strong { color:${emailTheme.dark.title} !important; }
    .email-body { color:${emailTheme.dark.body} !important; }
    .email-muted { color:${emailTheme.dark.muted} !important; }
    .email-surface { background-color:${emailTheme.dark.surface} !important; border-color:${emailTheme.dark.border} !important; }
    .email-callout { background-color:${emailTheme.dark.callout} !important; color:${emailTheme.dark.body} !important; }
    .email-link { color:${emailTheme.brand.darkLink} !important; }
    .email-divider { border-color:${emailTheme.dark.border} !important; }
  }
  [data-ogsc] .email-page { background-color:${emailTheme.dark.page} !important; }
  [data-ogsc] .email-card { background-color:${emailTheme.dark.card} !important; border-color:${emailTheme.dark.border} !important; }
  [data-ogsc] .email-title, [data-ogsc] .email-strong { color:${emailTheme.dark.title} !important; }
  [data-ogsc] .email-body { color:${emailTheme.dark.body} !important; }
  [data-ogsc] .email-muted { color:${emailTheme.dark.muted} !important; }
  [data-ogsc] .email-surface { background-color:${emailTheme.dark.surface} !important; border-color:${emailTheme.dark.border} !important; }
  [data-ogsc] .email-link { color:${emailTheme.brand.darkLink} !important; }
`;
