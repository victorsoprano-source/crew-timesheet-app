import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AuthErrorPage() {
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

        {/* Error Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold text-foreground mb-2">Authentication Error</h1>
        <p className="text-muted-foreground mb-8">
          Something went wrong during authentication. Please try again.
        </p>

        {/* Back to Login */}
        <Link href="/auth/login">
          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            Back to Sign In
          </Button>
        </Link>
      </div>
    </div>
  )
}
