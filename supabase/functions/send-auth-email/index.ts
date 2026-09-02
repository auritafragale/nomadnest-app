import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0"
import {
  renderBrandedEmail,
  sendBrandedEmail,
} from "../_shared/branded-email.ts"
import { buildAuthEmail } from "../_shared/email-templates.ts"

const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const payload = await req.text()
  const headers = Object.fromEntries(req.headers)

  console.log('Received auth email hook request')

  const wh = new Webhook(hookSecret)

  try {
    const {
      user,
      email_data: { token_hash, redirect_to, email_action_type },
    } = wh.verify(payload, headers) as {
      user: {
        email: string
      }
      email_data: {
        token: string
        token_hash: string
        redirect_to: string
        email_action_type: string
        site_url: string
        token_new: string
        token_hash_new: string
      }
    }

    console.log(`Processing ${email_action_type} email for ${user.email}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`

    const email = buildAuthEmail(email_action_type, verifyUrl)
    const html = renderBrandedEmail(email, {
      preview: email.preview,
      footerReason: email.footerReason,
    })

    await sendBrandedEmail(user.email, email.subject, html)

    console.log(`Successfully sent ${email_action_type} email to ${user.email}`)

  } catch (err: unknown) {
    const error = err as { code?: number; message?: string }
    console.error('Error in send-auth-email function:', error)
    return new Response(
      JSON.stringify({
        error: {
          http_code: error.code || 500,
          message: error.message || 'Unknown error',
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
