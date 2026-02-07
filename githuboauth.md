Login with GitHub

To enable GitHub Auth for your project, you need to set up a GitHub OAuth application and add the application credentials to your Supabase Dashboard.
Overview#

Setting up GitHub logins for your application consists of 3 parts:

    Create and configure a GitHub OAuth App on GitHub
    Add your GitHub OAuth keys to your Supabase Project
    Add the login code to your Supabase JS Client App

Find your callback URL#

The next step requires a callback URL, which looks like this: https://<project-ref>.supabase.co/auth/v1/callback

    Go to your Supabase Project Dashboard
    Click on the Authentication icon in the left sidebar
    Click on Sign In / Providers under the Configuration section
    Click on GitHub from the accordion list to expand and you'll find your Callback URL, you can click Copy to copy it to the clipboard

Local development#

When testing OAuth locally with the Supabase CLI, ensure your OAuth provider
is configured with the local Supabase Auth callback URL:

http://localhost:54321/auth/v1/callback

If this callback URL is missing or misconfigured, OAuth sign-in may fail or not redirect correctly during local development.

See the local development docs for more details.

For testing OAuth locally with the Supabase CLI see the local development docs.
Register a new OAuth application on GitHub#

    Navigate to the OAuth apps page
    Click Register a new application. If you've created an app before, click New OAuth App here.
    In Application name, type the name of your app.
    In Homepage URL, type the full URL to your app's website.
    In Authorization callback URL, type the callback URL of your app.
    Leave Enable Device Flow unchecked.
    Click Register Application.

Copy your new OAuth credentials

    Copy and save your Client ID.
    Click Generate a new client secret.
    Copy and save your Client secret.

Enter your GitHub credentials into your Supabase project#

    Go to your Supabase Project Dashboard
    In the left sidebar, click the Authentication icon (near the top)
    Click on Providers under the Configuration section
    Click on GitHub from the accordion list to expand and turn GitHub Enabled to ON
    Enter your GitHub Client ID and GitHub Client Secret saved in the previous step
    Click Save

You can also configure the GitHub auth provider using the Management API:

# Get your access token from https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN="your-access-token"
export PROJECT_REF="your-project-ref"
# Configure GitHub auth provider
curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_github_enabled": true,
    "external_github_client_id": "your-github-client-id",
    "external_github_secret": "your-github-client-secret"
  }'

Add login code to your client app#

Make sure you're using the right supabase client in the following code.

If you're not using Server-Side Rendering or cookie-based Auth, you can directly use the createClient from @supabase/supabase-js. If you're using Server-Side Rendering, see the Server-Side Auth guide for instructions on creating your Supabase client.

When your user signs in, call signInWithOAuth() with github as the provider:

async function () {
  const { ,  } = await ..({
    : 'github',
  })
}

For a PKCE flow, for example in Server-Side Auth, you need an extra step to handle the code exchange. When calling signInWithOAuth, provide a redirectTo URL which points to a callback route. This redirect URL should be added to your redirect allow list.

In the browser, signInWithOAuth automatically redirects to the OAuth provider's authentication endpoint, which then redirects to your endpoint.

await ..({
  ,
  : {
    : `http://example.com/auth/callback`,
  },
})

At the callback endpoint, handle the code exchange to save the user session.

Create a new file at src/routes/auth/callback/+server.js and populate with the following:
src/routes/auth/callback/+server.js

import { redirect } from '@sveltejs/kit';
export const GET = async (event) => {
	const {
		url,
		locals: { supabase }
	} = event;
	const code = url.searchParams.get('code') as string;
	const next = url.searchParams.get('next') ?? '/';
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      redirect(303, `/${next.slice(1)}`);
    }
  }
  // return the user to an error page with instructions
  redirect(303, '/auth/auth-code-error');
};

When your user signs out, call signOut() to remove them from the browser session and any objects from localStorage:

async function () {
  const {  } = await ..()
}

