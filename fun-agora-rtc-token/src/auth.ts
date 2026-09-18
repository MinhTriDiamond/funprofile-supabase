export interface AuthResult {
  userId: string;
  email?: string;
}

/**
 * Verify Supabase JWT token by calling Supabase Auth API.
 * Returns user info if valid, null if invalid.
 */
export async function verifySupabaseToken(
  authHeader: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<AuthResult | null> {
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    });

    if (!res.ok) return null;

    const user = (await res.json()) as { id?: string; email?: string };
    if (!user?.id) return null;

    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}
