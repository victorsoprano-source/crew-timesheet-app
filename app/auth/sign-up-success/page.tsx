import { CheckCircle, Mail } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/apple-touch-icon.png"
            alt="Crew Timesheet"
            className="w-20 h-20 rounded-2xl mb-4"
          />
        </div>

        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
        <p className="text-muted-foreground mb-6">
          We&apos;ve sent you a confirmation link. Please check your email to verify your account.
        </p>

        {/* Email Icon */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2 text-muted-foreground bg-card rounded-lg px-4 py-2 border border-border">
            <Mail className="w-4 h-4" />
            <span className="text-sm">Confirmation email sent</span>
          </div>
        </div>

        {/* Back to Login */}
        <Link href="/auth/login">
          <Button variant="outline" className="w-full border-border text-foreground hover:bg-card">
            Back to Sign In
          </Button>
        </Link>
      </div>
    </div>
  )
}
