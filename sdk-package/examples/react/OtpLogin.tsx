/**
 * OTP Login Example Component
 * 
 * This example shows how to implement OTP (One-Time Password) 
 * login flow using the Fun Profile SDK.
 * 
 * @example
 * ```tsx
 * import { OtpLogin } from './OtpLogin';
 * 
 * function App() {
 *   return <OtpLogin onSuccess={(user) => console.log('Logged in:', user)} />;
 * }
 * ```
 */

import { useState } from 'react';
import { 
  FunProfileClient, 
  LocalStorageAdapter,
  DOMAINS,
  type FunUser 
} from '@fun-ecosystem/sso-sdk';

interface OtpLoginProps {
  onSuccess?: (user: FunUser) => void;
  onError?: (error: Error) => void;
}

// Initialize SDK client
const funProfile = new FunProfileClient({
  clientId: 'fun_farm_client', // or fun_play_client, fun_planet_client
  redirectUri: `${DOMAINS.funFarm}/auth/callback`,
  scopes: ['profile', 'email'],
  storage: new LocalStorageAdapter('fun_farm_client'),
});

export function OtpLogin({ onSuccess, onError }: OtpLoginProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Request OTP
  const handleRequestOtp = async () => {
    if (!email) {
      setError('Please enter your email');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await funProfile.requestOtp({ 
        identifier: email, 
        type: 'email' 
      });

      if (result.success) {
        setStep('code');
        // Start countdown timer
        setCountdown(result.expiresInSeconds || 300);
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(result.message || 'Failed to send OTP');
      }
    } catch (err) {
      const message = (err as Error).message || 'Failed to request OTP';
      setError(message);
      onError?.(err as Error);
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async () => {
    if (!code || code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await funProfile.verifyOtp({ 
        identifier: email, 
        code 
      });

      console.log('OTP Login successful:', result.user);
      onSuccess?.(result.user);
    } catch (err) {
      const message = (err as Error).message || 'Invalid OTP code';
      setError(message);
      onError?.(err as Error);
    } finally {
      setLoading(false);
    }
  };

  // Format countdown display
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="otp-login">
      <h2>Login with Email</h2>

      {error && (
        <div className="error-message" style={{ color: 'red', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {step === 'email' ? (
        <div className="email-step">
          <label>
            Email Address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={loading}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>

          <button
            onClick={handleRequestOtp}
            disabled={loading || !email}
            style={{ marginTop: 16, padding: '8px 16px' }}
          >
            {loading ? 'Sending...' : 'Send OTP Code'}
          </button>
        </div>
      ) : (
        <div className="code-step">
          <p>We sent a code to <strong>{email}</strong></p>

          <label>
            Enter 6-digit code
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              disabled={loading}
              style={{ 
                display: 'block', 
                width: '100%', 
                padding: 8, 
                marginTop: 4,
                fontSize: 24,
                letterSpacing: 8,
                textAlign: 'center'
              }}
            />
          </label>

          {countdown > 0 && (
            <p style={{ color: 'gray', fontSize: 14 }}>
              Code expires in {formatCountdown(countdown)}
            </p>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={handleVerifyOtp}
              disabled={loading || code.length !== 6}
              style={{ padding: '8px 16px' }}
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>

            <button
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
              disabled={loading}
              style={{ padding: '8px 16px', background: 'transparent' }}
            >
              Change Email
            </button>
          </div>

          {countdown === 0 && (
            <button
              onClick={handleRequestOtp}
              disabled={loading}
              style={{ marginTop: 8, padding: '8px 16px', background: 'transparent' }}
            >
              Resend Code
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default OtpLogin;
