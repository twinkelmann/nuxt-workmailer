import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import type { Address } from 'nodemailer/lib/mailer'
import type { AuthType, User } from 'worker-mailer'
import { useRuntimeConfig } from '#imports'

/**
 * Convert one nodemailer address into the shape worker-mailer expects
 *
 * worker-mailer reads a string as a bare address. Without this, the name in `"John Doe" <john@doe.com>` ends up in the SMTP envelope, and the server refuses the mail
 */
function toUser(address: string | Address): User {
  if (typeof address !== 'string') {
    return { name: address.name, email: address.address }
  }

  const named = address.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)

  return named
    ? { name: named[1] || undefined, email: named[2] }
    : { email: address.trim() }
}

function toUsers(addresses: SMTPTransport.MailOptions['to']) {
  if (!addresses) return undefined

  return (Array.isArray(addresses) ? addresses : [addresses]).map(toUser)
}

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
    }
    else {
      // Production: Use worker-mailer in Cloudflare Workers environment
      const { WorkerMailer } = await import('worker-mailer')
      const { from = nodemailer.from, to, cc, bcc, replyTo, ...rest } = options
      const [reply, ...extraReplies] = toUsers(replyTo) ?? []

      if (extraReplies.length) {
        throw new Error('worker-mailer accepts a single replyTo address')
      }

      await WorkerMailer.send(
        {
          credentials: {
            username: nodemailer.auth.user,
            password: nodemailer.auth.pass,
          },
          authType: nodemailer.authMethod
            ? (String(nodemailer.authMethod).toLowerCase() as AuthType)
            : 'plain',
          host: nodemailer.host,
          port: nodemailer.port,
          secure: nodemailer.secure,
        },
        {
          ...rest,
          from: toUser(from),
          to: toUsers(to) ?? [],
          reply,
          cc: toUsers(cc),
          bcc: toUsers(bcc),
        },
      )
    }
  }

  return {
    nodemailer,
    sendMail,
  }
}
