interface ValidateResult {
  valid: boolean;
  error?: string;
}

export function validateInput(body: any): ValidateResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { channelName, uid, role } = body;

  // channelName: required, safe characters only
  if (!channelName || typeof channelName !== 'string') {
    return { valid: false, error: 'channelName is required' };
  }
  if (!/^[a-zA-Z0-9_\-\.]{1,64}$/.test(channelName)) {
    return { valid: false, error: 'channelName contains invalid characters (only a-z, A-Z, 0-9, _ - . allowed, max 64 chars)' };
  }

  // uid: required (string or number)
  if (uid === undefined || uid === null || uid === '') {
    return { valid: false, error: 'uid is required' };
  }

  // role: only publisher or subscriber
  if (role && !['publisher', 'subscriber'].includes(role)) {
    return { valid: false, error: 'role must be "publisher" or "subscriber"' };
  }

  return { valid: true };
}
