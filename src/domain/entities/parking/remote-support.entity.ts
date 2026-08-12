export const REMOTE_SUPPORT_PROVIDERS = [
  "MESHCENTRAL",
  "RUSTDESK",
  "VIGGO_REMOTE",
  "CUSTOM",
] as const;

export type RemoteSupportProvider = (typeof REMOTE_SUPPORT_PROVIDERS)[number];

export const DEFAULT_REMOTE_SUPPORT_PROVIDER: RemoteSupportProvider =
  "MESHCENTRAL";

export const parseRemoteSupportProvider = (
  value: unknown,
): RemoteSupportProvider | null => {
  const provider = String(value ?? DEFAULT_REMOTE_SUPPORT_PROVIDER)
    .trim()
    .toUpperCase();

  return REMOTE_SUPPORT_PROVIDERS.includes(provider as RemoteSupportProvider)
    ? (provider as RemoteSupportProvider)
    : null;
};

