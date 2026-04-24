/**
 * OAuth 2.0 Client for Nextcloud integration
 * Uses native fetch API for OAuth flow
 */

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in seconds
  scope?: string;
}

/**
 * OAuth Client for Nextcloud CalDAV integration
 */
export class NextcloudOAuthClient {
  private config: OAuthConfig;
  private tokens: OAuthTokens | null = null;

  constructor(config: OAuthConfig) {
    if (!config.clientId || !config.clientSecret || !config.authUrl || !config.tokenUrl || !config.redirectUri) {
      throw new Error('OAuth configuration is incomplete');
    }
    this.config = config;
  }

  /**
   * Generate authorization URL for user to visit
   * This starts the OAuth flow
   * @param state - Optional state parameter for CSRF protection
   * @returns Authorization URL and state
   */
  getAuthorizationUrl(state?: string): { url: string; state: string } {
    const generatedState = state || this.generateState();
    
    const authorizationUrl = new URL(this.config.authUrl);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', this.config.clientId);
    authorizationUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authorizationUrl.searchParams.set('state', generatedState);
    authorizationUrl.searchParams.set('scope', 'openid profile email');
    
    return {
      url: authorizationUrl.toString(),
      state: generatedState
    };
  }

  /**
   * Exchange authorization code for tokens
   * Called after user returns from OAuth provider
   * @param code - Authorization code from provider
   * @param state - State parameter (for verification)
   * @returns OAuth tokens
   */
  async exchangeCode(code: string, state?: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    if (state) {
      params.append('state', state);
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenResponse = await response.json();

    const expiresAt = Math.floor(Date.now() / 1000) + (tokenResponse.expires_in || 3600);
    
    this.tokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || '',
      expiresAt,
      scope: tokenResponse.scope
    };

    return this.tokens;
  }

  /**
   * Refresh access token using refresh token
   * @returns New OAuth tokens
   */
  async refreshToken(): Promise<OAuthTokens> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokenResponse = await response.json();

    const expiresAt = Math.floor(Date.now() / 1000) + (tokenResponse.expires_in || 3600);
    
    this.tokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || this.tokens.refreshToken,
      expiresAt,
      scope: tokenResponse.scope || this.tokens.scope
    };

    return this.tokens;
  }

  /**
   * Get current access token, refreshing if expired
   * @returns Current access token
   */
  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('No tokens available. User must authenticate first.');
    }

    // Check if token is expired or about to expire (within 30 seconds)
    const now = Math.floor(Date.now() / 1000);
    if ((this.tokens.expiresAt - now) < 30) {
      await this.refreshToken();
    }

    return this.tokens.accessToken;
  }

  /**
   * Set tokens manually (e.g., from database)
   * @param tokens - OAuth tokens to set
   */
  setTokens(tokens: OAuthTokens): void {
    this.tokens = tokens;
  }

  /**
   * Clear current tokens
   */
  clearTokens(): void {
    this.tokens = null;
  }

  /**
   * Get current tokens
   * @returns Current tokens or null if not authenticated
   */
  getTokens(): OAuthTokens | null {
    return this.tokens;
  }

  /**
   * Check if token is expired
   * @returns true if expired or not set
   */
  isTokenExpired(): boolean {
    if (!this.tokens) return true;
    const now = Math.floor(Date.now() / 1000);
    return this.tokens.expiresAt <= now;
  }

  /**
   * Generate a random state string for CSRF protection
   * @returns Random state string
   */
  private generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Create OAuth client from environment variables
 */
export function createOAuthClientFromEnv(): NextcloudOAuthClient {
  return new NextcloudOAuthClient({
    clientId: process.env.OAUTH_CLIENT_ID || '',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
    authUrl: process.env.OAUTH_AUTH_URL || '',
    tokenUrl: process.env.OAUTH_TOKEN_URL || '',
    redirectUri: process.env.OAUTH_REDIRECT_URI || ''
  });
}
