"use client"

import { useState } from "react"
import { Dashboard } from "@/components/crew-timesheet/dashboard"
import { Timesheet } from "@/components/crew-timesheet/timesheet"
import { AddWorker } from "@/components/crew-timesheet/add-worker"
import { CrewList } from "@/components/crew-timesheet/crew-list"
import { DailyReports } from "@/components/crew-timesheet/daily-reports"
import { Certifications } from "@/components/crew-timesheet/certifications"
import { BottomNav } from "@/components/crew-timesheet/bottom-nav"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function CrewTimesheetApp() {
  const [currentScreen, setCurrentScreen] = useState("dashboard")

  const getScreenTitle = (screen: string) => {
    switch (screen) {
      case "timesheet":
        return "Create Timesheet"
      case "add-worker":
        return "Add Worker"
      case "crew-list":
        return "Crew List"
      case "reports":
        return "Reports"
      case "certifications":
        return "Certifications"
      default:
        return ""
    }
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case "timesheet":
        return <Timesheet />
      case "add-worker":
        return <AddWorker />
      case "crew-list":
        return <CrewList onNavigate={setCurrentScreen} />
      case "reports":
        return <DailyReports />
      case "certifications":
        return <Certifications />
      default:
        return <Dashboard supervisorName="John Martinez" onNavigate={setCurrentScreen} />
    }
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto relative">
      {/* Header for sub-screens */}
      {currentScreen !== "dashboard" && (
        <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-background border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentScreen("dashboard")}
            className="text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">{getScreenTitle(currentScreen)}</h1>
        </header>
      )}

      {/* Main Content */}
      <main className="pb-20">
        {renderScreen()}
      </main>

      {/* Bottom Navigation */}
      <BottomNav currentScreen={currentScreen} onNavigate={setCurrentScreen} />
    </div>
  )
}
