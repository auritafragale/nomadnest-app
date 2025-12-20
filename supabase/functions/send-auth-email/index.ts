import React from "https://esm.sh/react@18.3.1"
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0"
import { Resend } from "https://esm.sh/resend@4.0.0"
import { 
  renderAsync, 
  Html, 
  Head, 
  Body, 
  Container, 
  Section, 
  Heading, 
  Text, 
  Link, 
  Hr, 
  Preview 
} from "https://esm.sh/@react-email/components@0.0.22"

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string)
const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string

// Inline email template styles
const styles = {
  main: {
    backgroundColor: '#fdf8f6',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif",
  },
  container: {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '40px 20px',
    maxWidth: '560px',
    borderRadius: '12px',
  },
  logoSection: {
    textAlign: 'center' as const,
    marginBottom: '32px',
  },
  h1: {
    color: '#1a1a1a',
    fontSize: '28px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    margin: '0 0 24px',
  },
  text: {
    color: '#4a4a4a',
    fontSize: '16px',
    lineHeight: '26px',
    textAlign: 'center' as const,
    margin: '0 0 24px',
  },
  textMuted: {
    color: '#888888',
    fontSize: '14px',
    lineHeight: '22px',
    textAlign: 'center' as const,
    margin: '24px 0 0',
  },
  buttonContainer: {
    textAlign: 'center' as const,
    margin: '32px 0',
  },
  button: {
    backgroundColor: '#e07a5f',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '14px 32px',
  },
  hr: {
    borderColor: '#e5e5e5',
    margin: '32px 0',
  },
  footer: {
    color: '#888888',
    fontSize: '12px',
    lineHeight: '20px',
    textAlign: 'center' as const,
    margin: '0',
  },
}

interface PasswordResetEmailProps {
  supabase_url: string
  token_hash: string
  redirect_to: string
  email_action_type: string
}

const PasswordResetEmail = ({
  supabase_url,
  token_hash,
  redirect_to,
  email_action_type,
}: PasswordResetEmailProps) => (
  React.createElement(Html, null,
    React.createElement(Head, null),
    React.createElement(Preview, null, "Reset your NomadNest password"),
    React.createElement(Body, { style: styles.main },
      React.createElement(Container, { style: styles.container },
        React.createElement(Section, { style: styles.logoSection },
          React.createElement(Text, { style: { fontSize: '24px', fontWeight: 'bold', color: '#1a1a1a', margin: '0' } }, "🏠 NomadNest")
        ),
        React.createElement(Heading, { style: styles.h1 }, "Reset Your Password"),
        React.createElement(Text, { style: styles.text },
          "We received a request to reset your password for your NomadNest account. Click the button below to create a new password."
        ),
        React.createElement(Section, { style: styles.buttonContainer },
          React.createElement(Link, {
            href: `${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`,
            target: "_blank",
            style: styles.button
          }, "Reset Password")
        ),
        React.createElement(Text, { style: styles.textMuted },
          "This link will expire in 24 hours. If you didn't request a password reset, you can safely ignore this email."
        ),
        React.createElement(Hr, { style: styles.hr }),
        React.createElement(Text, { style: styles.footer },
          "© 2024 NomadNest. All rights reserved. Connecting pet owners with trusted sitters worldwide."
        )
      )
    )
  )
)

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

    let html: string
    let subject: string

    // Handle different email types
    if (email_action_type === 'recovery') {
      html = await renderAsync(
        React.createElement(PasswordResetEmail, {
          supabase_url: Deno.env.get('SUPABASE_URL') ?? '',
          token_hash,
          redirect_to,
          email_action_type,
        })
      )
      subject = 'Reset your NomadNest password'
    } else {
      // Default handling for other email types
      html = `
        <div style="font-family: sans-serif; padding: 20px; background: #fdf8f6;">
          <div style="max-width: 560px; margin: 0 auto; background: #fff; padding: 40px 20px; border-radius: 12px;">
            <h1 style="text-align: center; color: #1a1a1a;">🏠 NomadNest</h1>
            <p style="text-align: center; color: #4a4a4a;">Click the link below to complete your action:</p>
            <p style="text-align: center;">
              <a href="${Deno.env.get('SUPABASE_URL')}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}" 
                 style="background: #e07a5f; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; display: inline-block;">
                Continue
              </a>
            </p>
          </div>
        </div>
      `
      subject = 'NomadNest - Action Required'
    }

    const { error } = await resend.emails.send({
      from: 'NomadNest <onboarding@resend.dev>',
      to: [user.email],
      subject,
      html,
    })

    if (error) {
      console.error('Error sending email via Resend:', error)
      throw error
    }

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
