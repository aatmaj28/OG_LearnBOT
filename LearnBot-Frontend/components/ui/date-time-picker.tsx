"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar, Clock, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface DateTimePickerProps {
  value: string
  onChange: (value: string) => void
  min?: Date
  className?: string
  isDarkMode?: boolean
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function DateTimePicker({ value, onChange, min, className, isDarkMode = false }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(value ? new Date(value) : null)
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedHour, setSelectedHour] = useState(12)
  const [selectedMinute, setSelectedMinute] = useState(0)
  const [isAM, setIsAM] = useState(true)
  const pickerRef = useRef<HTMLDivElement>(null)

  const minDate = min || new Date()

  useEffect(() => {
    if (value) {
      const date = new Date(value)
      setSelectedDate(date)
      setSelectedHour(date.getHours() % 12 || 12)
      setSelectedMinute(date.getMinutes())
      setIsAM(date.getHours() < 12)
    }
  }, [value])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay()
  }

  const isDateDisabled = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const checkDate = new Date(date)
    checkDate.setHours(0, 0, 0, 0)
    return checkDate < today
  }

  const isDateSelected = (date: Date) => {
    if (!selectedDate) return false
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    )
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    )
  }

  const handleDateSelect = (day: number) => {
    const newDate = new Date(currentYear, currentMonth, day)
    if (isDateDisabled(newDate)) return

    const finalDate = new Date(newDate)
    finalDate.setHours(isAM ? selectedHour : selectedHour + 12, selectedMinute, 0, 0)
    
    // If the selected date is today, ensure time is in the future
    const now = new Date()
    if (finalDate <= now) {
      const futureTime = new Date(now.getTime() + 60 * 60 * 1000) // Add 1 hour
      finalDate.setHours(futureTime.getHours(), futureTime.getMinutes(), 0, 0)
      setSelectedHour(futureTime.getHours() % 12 || 12)
      setSelectedMinute(futureTime.getMinutes())
      setIsAM(futureTime.getHours() < 12)
    }

    setSelectedDate(finalDate)
    const isoString = finalDate.toISOString().slice(0, 16)
    onChange(isoString)
  }

  const handleTimeChange = (hour: number, minute: number, am: boolean) => {
    setSelectedHour(hour)
    setSelectedMinute(minute)
    setIsAM(am)

    if (selectedDate) {
      const newDate = new Date(selectedDate)
      newDate.setHours(am ? hour : hour + 12, minute, 0, 0)
      
      const now = new Date()
      if (newDate <= now) {
        const futureTime = new Date(now.getTime() + 60 * 60 * 1000)
        newDate.setHours(futureTime.getHours(), futureTime.getMinutes(), 0, 0)
        setSelectedHour(futureTime.getHours() % 12 || 12)
        setSelectedMinute(futureTime.getMinutes())
        setIsAM(futureTime.getHours() < 12)
      }

      setSelectedDate(newDate)
      const isoString = newDate.toISOString().slice(0, 16)
      onChange(isoString)
    }
  }

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  const formatDisplayValue = () => {
    if (!selectedDate) return ""
    const date = selectedDate
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const year = date.getFullYear()
    const hours = date.getHours() % 12 || 12
    const minutes = String(date.getMinutes()).padStart(2, "0")
    const ampm = date.getHours() < 12 ? "AM" : "PM"
    return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`
  }

  const daysInMonth = getDaysInMonth(currentMonth, currentYear)
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear)
  const days = []

  // Add empty cells for days before the first day of the month
  for (let i = 0; i < firstDay; i++) {
    days.push(null)
  }

  // Add cells for each day of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day)
  }

  return (
    <div className={cn("relative", className)} ref={pickerRef}>
      <div className="relative">
        <Input
          type="text"
          readOnly
          value={formatDisplayValue()}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "cursor-pointer pr-10",
            isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : '',
            className
          )}
          placeholder="Select date and time"
        />
        <Calendar className={cn(
          "absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none",
          isDarkMode ? "text-gray-400" : "text-gray-500"
        )} />
      </div>

      {isOpen && (
        <div className={cn(
          "absolute z-50 mt-2 p-3 rounded-lg shadow-lg border",
          isDarkMode 
            ? "bg-gray-800 border-gray-700" 
            : "bg-white border-gray-200"
        )} style={{ width: "auto" }}>
          <div className="flex gap-3">
            {/* Calendar Section */}
            <div className="flex-shrink-0">
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevMonth}
                  className={cn(
                    "h-8 w-8",
                    isDarkMode 
                      ? "hover:bg-gray-700 text-gray-300" 
                      : "hover:bg-gray-100 text-gray-700"
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className={cn(
                  "font-semibold text-sm",
                  isDarkMode ? "text-gray-100" : "text-gray-900"
                )}>
                  {MONTHS[currentMonth]} {currentYear}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNextMonth}
                  className={cn(
                    "h-8 w-8",
                    isDarkMode 
                      ? "hover:bg-gray-700 text-gray-300" 
                      : "hover:bg-gray-100 text-gray-700"
                  )}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Calendar Grid */}
              <div>
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {DAYS.map((day) => (
                    <div
                      key={day}
                      className={cn(
                        "text-center text-xs font-medium py-1",
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      )}
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {days.map((day, index) => {
                    if (day === null) {
                      return <div key={index} />
                    }
                    const date = new Date(currentYear, currentMonth, day)
                    const disabled = isDateDisabled(date)
                    const selected = isDateSelected(date)
                    const today = isToday(date)

                    return (
                      <button
                        key={day}
                        onClick={() => handleDateSelect(day)}
                        disabled={disabled}
                        className={cn(
                          "h-7 w-7 rounded text-xs font-medium transition-colors",
                          disabled && "opacity-30 cursor-not-allowed",
                          selected && "bg-blue-600 text-white hover:bg-blue-700",
                          !selected && !disabled && isDarkMode
                            ? "text-gray-200 hover:bg-gray-700"
                            : !selected && !disabled && "text-gray-900 hover:bg-gray-100",
                          today && !selected && "ring-2 ring-blue-500 ring-offset-1",
                          isDarkMode && today && !selected && "ring-offset-gray-800"
                        )}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Time Picker Section */}
            <div className={cn(
              "flex-shrink-0 border-l pl-3",
              isDarkMode ? "border-gray-700" : "border-gray-200"
            )}>
              <div className={cn(
                "flex items-center gap-1.5 mb-2",
                isDarkMode ? "text-gray-300" : "text-gray-700"
              )}>
                <Clock className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Time</span>
              </div>
              <div className="flex flex-col gap-2">
                {/* Hour */}
                <div>
                  <label className={cn(
                    "text-xs mb-0.5 block",
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  )}>Hour</label>
                  <select
                    value={selectedHour}
                    onChange={(e) => handleTimeChange(Number(e.target.value), selectedMinute, isAM)}
                    className={cn(
                      "w-20 px-2 py-1.5 rounded-md border text-center text-xs font-medium",
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-gray-100"
                        : "bg-white border-gray-300 text-gray-900"
                    )}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Minute */}
                <div>
                  <label className={cn(
                    "text-xs mb-0.5 block",
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  )}>Minute</label>
                  <select
                    value={selectedMinute}
                    onChange={(e) => handleTimeChange(selectedHour, Number(e.target.value), isAM)}
                    className={cn(
                      "w-20 px-2 py-1.5 rounded-md border text-center text-xs font-medium",
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-gray-100"
                        : "bg-white border-gray-300 text-gray-900"
                    )}
                  >
                    {Array.from({ length: 60 }, (_, i) => i).map((minute) => (
                      <option key={minute} value={minute}>
                        {String(minute).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </div>

                {/* AM/PM */}
                <div>
                  <label className={cn(
                    "text-xs mb-0.5 block",
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  )}>Period</label>
                  <select
                    value={isAM ? "AM" : "PM"}
                    onChange={(e) => handleTimeChange(selectedHour, selectedMinute, e.target.value === "AM")}
                    className={cn(
                      "w-20 px-2 py-1.5 rounded-md border text-center text-xs font-medium",
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-gray-100"
                        : "bg-white border-gray-300 text-gray-900"
                    )}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

