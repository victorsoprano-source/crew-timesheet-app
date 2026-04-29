"use client"

import { useState, useEffect } from "react"
import { Dashboard } from "@/components/crew-timesheet/dashboard"
import { Timesheet } from "@/components/crew-timesheet/timesheet"
import { AddWorker } from "@/components/crew-timesheet/add-worker"
import { CrewList } from "@/components/crew-timesheet/crew-list"
import { DailyReports } from "@/components/crew-timesheet/daily-reports"
import { Certifications } from "@/components/crew-timesheet/certifications"
import { BottomNav } from "@/components/crew-timesheet/bottom-nav"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, HardHat } from "lucide-react"

export default function CrewTimesheetApp() {
  const [appReady, setAppReady] = useState(false)
  const [currentScreen, setCurrentScreen] = useState("dashboard")

  useEffect(() => {
    const savedScreen = localStorage.getItem("crew-current-screen")
    if (savedScreen) {
      setCurrentScreen(savedScreen)
    }

    requestAnimationFrame(() => {
      setAppReady(true)
    })
  }, [])

  useEffect(() => {
    if (appReady) {
      localStorage.setItem("crew-current-screen", currentScreen)
    }
  }, [currentScreen, appReady])

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
        return <Dashboard supervisorName="Victor Rodriguez" onNavigate={setCurrentScreen} />
    }
  }

  if (!appReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          maxWidth: "28rem",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1a1b2e",
          padding: "1rem",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
          <div
            style={{
              width: "4rem",
              height: "4rem",
              borderRadius: "1rem",
              backgroundColor: "#5b8def",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HardHat style={{ height: "2rem", width: "2rem", color: "#ffffff" }} />
          </div>

          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#fafafa",
              margin: 0,
            }}
          >
            Crew Timesheet
          </h1>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", marginTop: "1rem" }}>
            <Loader2
              style={{
                height: "1.5rem",
                width: "1.5rem",
                color: "#5b8def",
                animation: "spin 1s linear infinite",
              }}
            />
            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#a1a1aa", margin: 0 }}>
              Loading crew data...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto relative">
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

      <main className="pb-20">{renderScreen()}</main>

      <BottomNav currentScreen={currentScreen} onNavigate={setCurrentScreen} />
    </div>
  )
}