import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import { mountSimulator } from './simulator.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

type AccessResult = { access: boolean; error?: string };

async function requestAccess(session: Session, reference?: string) {
  const response = await fetch(reference ? '/api/paystack/verify' : '/api/paystack/access', {
    method: reference ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(reference ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(reference ? { body: JSON.stringify({ reference }) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not check your purchase access.');
  return result as AccessResult;
}

function AccessGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signOut = useCallback(() => {
    void supabase?.auth.signOut();
  }, []);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setHasAccess(false);
      setMessage('');
      setReady(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const reference = new URLSearchParams(window.location.search).get('reference')
      || new URLSearchParams(window.location.search).get('trxref');
    void requestAccess(session, reference || undefined)
      .then(({ access }) => {
        if (!active) return;
        setHasAccess(access);
        try {
          const cacheKey = `studyline.verified-access.${session.user.id}`;
          if (access) localStorage.setItem(cacheKey, '1');
          else localStorage.removeItem(cacheKey);
        } catch {
          // Access still works online if browser storage is unavailable.
        }
        if (reference) {
          window.history.replaceState({}, '', window.location.pathname);
          setMessage(access ? 'Payment confirmed. Your access is ready.' : 'Payment is not confirmed yet. Please try again shortly.');
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        try {
          const cached = localStorage.getItem(`studyline.verified-access.${session.user.id}`) === '1';
          if (cached && !reference) {
            setHasAccess(true);
            setMessage('Offline mode: using this device’s last verified access.');
            return;
          }
        } catch {
          // Fall through to the connection error below.
        }
        setMessage(error instanceof Error ? error.message : 'Could not verify access.');
      });
    return () => { active = false; };
  }, [session]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage('');
    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) {
        setMessage('Check your email to confirm your account, then sign in here.');
      } else if (mode === 'signup') {
        setMessage('Account created. Sign in after confirming your email.');
      }
      setPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout() {
    if (!session) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.authorizationUrl) {
        throw new Error(result.error || 'Could not start Paystack checkout.');
      }
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start checkout.');
      setBusy(false);
    }
  }

  if (hasAccess && session) {
    return (
      <div className="access-app">
        <Simulator
          accountName={
            (typeof session.user.user_metadata?.full_name === 'string' && session.user.user_metadata.full_name)
            || (typeof session.user.user_metadata?.name === 'string' && session.user.user_metadata.name)
            || session.user.email?.split('@')[0]
            || 'Student'
          }
          accountEmail={session.user.email || ''}
          onSignOut={signOut}
        />
      </div>
    );
  }

  return (
    <main className="paywall-page">
      <section className="paywall-card" aria-labelledby="paywall-title">
        <div className="paywall-mark" aria-hidden="true">S</div>
        <p className="paywall-eyebrow">Studyline · CGPA planner</p>
        <h1 id="paywall-title">Plan your degree with confidence.</h1>
        <p className="paywall-copy">Sign in or create an account, then unlock permanent access with a one-time payment.</p>
        <div className="paywall-price"><strong>GHS 30</strong><span>one-time payment</span></div>
        {!supabase ? (
          <div className="paywall-notice" role="status">
            Account setup is not connected yet. Add the Supabase project URL and public anon key to the Vercel environment before enabling access.
          </div>
        ) : !ready ? (
          <p className="paywall-status" role="status">Checking your account…</p>
        ) : !session ? (
          <form className="paywall-form" onSubmit={submitAuth}>
            <h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="paywall-primary" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
            <button className="paywall-switch" type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(''); }}>
              {mode === 'signup' ? 'Already have an account? Sign in' : 'New to Studyline? Create an account'}
            </button>
          </form>
        ) : (
          <div className="paywall-form">
            <h2>Unlock your Studyline access</h2>
            <p className="paywall-copy">Your payment is checked securely before access is granted.</p>
            <button className="paywall-primary" disabled={busy} type="button" onClick={() => void startCheckout()}>
              {busy ? 'Opening Paystack…' : 'Pay GHS 30 with Paystack'}
            </button>
            <button className="paywall-switch" type="button" onClick={() => void supabase?.auth.signOut()}>Use another account</button>
          </div>
        )}
        {message && <p className="paywall-status" role="status" aria-live="polite">{message}</p>}
        <p className="paywall-footnote">Your payment is linked to this account. Studyline stores course plans on this device.</p>
      </section>
    </main>
  );
}

function Simulator({
  accountName,
  accountEmail,
  onSignOut,
}: {
  accountName: string;
  accountEmail: string;
  onSignOut: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mountRef.current) return;
    return mountSimulator(mountRef.current, { accountName, accountEmail, onSignOut });
  }, [accountName, accountEmail, onSignOut]);
  return <div ref={mountRef} />;
}

function App() {
  return <AccessGate />;
}

export default App;
