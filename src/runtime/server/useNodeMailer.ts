import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import { useRuntimeConfig } from '#imports'
import { AuthType } from 'worker-mailer'

export const useNodeMailer = () => {
  const { nodemailer } = useRuntimeConfig()

  const sendMail = async (options: SMTPTransport.MailOptions) => {
    // Check if running in development environment
    if (import.meta.dev) {
      // Development: Use nodemailer
      const { createTransport } = await import('nodemailer')
      const transport = createTransport(nodemailer as SMTPTransport.Options)
      const res = await transport.sendMail({
        from: nodemailer.from,
        ...options,
      })
      transport.close()
      return res
    } else {
      // Production: Use worker-mailer in Cloudflare Workers environment
      const { WorkerMailer } = await import('worker-mailer')
      await WorkerMailer.send(
        {
          credentials: {
            username: nodemailer.auth.user,
            password: nodemailer.auth.pass,
          },
          authType:
            (String(nodemailer.authMethod).toLowerCase() as AuthType) ||
            'plain',
          host: nodemailer.host,
          port: nodemailer.port,
          secure: nodemailer.secure,
        },
        {
          from: nodemailer.from,
          ...options,
        },
      )
    }
  }

  return {
    nodemailer,
    sendMail,
  }
}
