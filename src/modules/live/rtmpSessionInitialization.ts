export type InitialRtmpSessionOptions = { persistent: boolean } | undefined;

/**
 * A preference lookup is optional initialization context. A create/resume failure
 * must propagate and must never be interpreted as a reason to create a second session.
 */
export async function initializeRtmpSession<T>(
  readPreference: () => Promise<boolean | undefined>,
  createSession: (options: InitialRtmpSessionOptions) => Promise<T>,
): Promise<T> {
  let preference: boolean | undefined;
  try {
    preference = await readPreference();
  } catch {
    preference = undefined;
  }

  return createSession(typeof preference === 'boolean' ? { persistent: preference } : undefined);
}
