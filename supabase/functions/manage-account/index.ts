/**
 * manage-account — issues, revokes and resets the credentials behind an account.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * Creating an auth user needs the Auth Admin API, which needs the service_role
 * key. That key bypasses RLS completely, so the app must never hold it — a
 * phone is not a place a key like that can live. It lives here, in the Edge
 * runtime, and this function is the only thing that uses it.
 *
 * HOW THE CALLER IS CHECKED
 * -------------------------
 * The service role is not touched until the caller has been checked WITH THEIR
 * OWN TOKEN. account_for_credentials() runs under the caller's JWT and raises
 * unless they are a Super Admin; it also returns the email and the current auth
 * user id straight from the database.
 *
 * That last part matters: the client sends only an account id. Everything acted
 * on — which email gets the password, which auth user gets deleted — comes back
 * from the database, so a caller cannot name one account and have another one
 * changed.
 *
 * WHAT IT DOES
 * ------------
 *   enable   create the auth user (or reset its password) and set can_login
 *   disable  delete the auth user, then set can_login = false
 *   reset    set a new password, leaving everything else alone
 *
 * On `disable` the auth user is deleted before the flag is cleared. The other
 * order would leave a window in which the account is marked unable to log in
 * while the password still works, and that window is exactly the moment someone
 * would use it.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Matches the rule stated on the sign-in screen. */
const MIN_PASSWORD = 8;

type Action = 'enable' | 'disable' | 'reset';

interface AccountFacts {
  id: string;
  email: string | null;
  fullName: string;
  role: string | null;
  authUserId: string | null;
  canLogin: boolean;
  isActive: boolean;
  lastSuperAdmin: boolean;
}

class Api {
  constructor(
    private readonly baseUrl: string,
    private readonly anonKey: string,
    private readonly authorization: string,
  ) {}

  /** Runs as the caller. RLS and the SECURITY DEFINER guards both apply. */
  async rpc<T>(name: string, args: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: this.anonKey,
        Authorization: this.authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error((JSON.parse(body) as { message?: string }).message ?? body);
    }
    return (body ? JSON.parse(body) : null) as T;
  }
}

class AuthAdmin {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
  ) {}

  private get headers(): Record<string, string> {
    return {
      apikey: this.serviceKey,
      Authorization: `Bearer ${this.serviceKey}`,
      'Content-Type': 'application/json',
    };
  }

  async createUser(email: string, password: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: this.headers,
      // Confirmed on creation: there is no SMTP on this project, so an
      // unconfirmed user would be one nobody could ever sign in as.
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.msg ?? body.message ?? 'Could not create the sign-in');
    }
    return body.id as string;
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.msg ?? body.message ?? 'Could not set the password');
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    // 404 means it is already gone, which is the state we were asking for.
    if (!response.ok && response.status !== 404) {
      const body = await response.json();
      throw new Error(body.msg ?? body.message ?? 'Could not remove the sign-in');
    }
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ error: 'Not signed in' }, 401);

    const { accountId, action, password } = (await request.json()) as {
      accountId?: string;
      action?: Action;
      password?: string;
    };

    if (!accountId) return json({ error: 'accountId is required' }, 400);
    if (action !== 'enable' && action !== 'disable' && action !== 'reset') {
      return json({ error: 'Unknown action' }, 400);
    }

    const baseUrl = Deno.env.get('SUPABASE_URL')!;
    const api = new Api(baseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, authorization);

    // Raises unless the caller is a Super Admin — before any privileged key is
    // read, and using the caller's own token to decide.
    const account = await api.rpc<AccountFacts>('account_for_credentials', { p_id: accountId });

    const admin = new AuthAdmin(baseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (action === 'disable') {
      if (account.lastSuperAdmin) {
        return json(
          { error: 'This is the only Super Admin left — give someone else the role first' },
          400,
        );
      }
      if (account.authUserId) await admin.deleteUser(account.authUserId);
      await api.rpc('set_account_login', { p_id: accountId, p_can_login: false });
      return json({ accountId, canLogin: false });
    }

    if (!password || password.length < MIN_PASSWORD) {
      return json({ error: `The password must be at least ${MIN_PASSWORD} characters` }, 400);
    }

    if (action === 'reset') {
      if (!account.authUserId) {
        return json({ error: 'This account has no sign-in to reset' }, 400);
      }
      await admin.setPassword(account.authUserId, password);
      return json({ accountId, reset: true });
    }

    // enable
    if (!account.email) {
      return json({ error: 'Add an email address to this account first' }, 400);
    }
    if (!account.role) {
      return json({ error: 'Choose a role before this account can log in' }, 400);
    }

    if (account.authUserId) {
      // Already has credentials — this is a password change with the switch
      // already on, so treat it as one rather than failing on "user exists".
      await admin.setPassword(account.authUserId, password);
    } else {
      // can_login must be true BEFORE the auth user exists:
      // link_auth_user_to_account() (migration 0004) only claims accounts that
      // are already marked as able to log in. The other order silently creates
      // an orphaned auth user that matches nothing.
      await api.rpc('set_account_login', { p_id: accountId, p_can_login: true });
      try {
        await admin.createUser(account.email, password);
      } catch (e) {
        // Put the flag back rather than leaving an account that claims it can
        // log in with no way to do so.
        await api.rpc('set_account_login', { p_id: accountId, p_can_login: false });
        throw e;
      }
    }

    await api.rpc('set_account_login', { p_id: accountId, p_can_login: true });
    return json({ accountId, canLogin: true, email: account.email });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
