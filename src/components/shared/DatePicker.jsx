import React, { useState, useRef, useEffect } from "react";

const MONTH_NAMES = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];
const DAY_NAMES = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekday(year, month) {
  const day = new Date(year, month, 1).getDay();
  return (day + 6) % 7;
}

function parseIso(str) {
  if (!str || str.length < 10) return null;
  const [y, m, d] = str.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

function toIso(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDisplay(str) {
  if (!str || str.length < 10) return "";
  const [y, m, d] = str.split("-");
  return `${d}.${m}.${y}`;
}

export default function DatePicker({ value, onChange, placeholder = "дд.мм.гггг", disabled = false }) {
  const today = new Date();
  const parsed = parseIso(value);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const containerRef = useRef(null);

  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [value]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const prevMonth = () => {
    if (disabled) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (disabled) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const selectDay = (day) => {
    if (disabled) return;
    onChange(toIso(viewYear, viewMonth, day));
    setOpen(false);
  };

  const selectToday = () => {
    if (disabled) return;
    const d = new Date();
    onChange(toIso(d.getFullYear(), d.getMonth(), d.getDate()));
    setOpen(false);
  };

  const clearValue = () => {
    if (disabled) return;
    onChange("");
    setOpen(false);
  };

  const firstDay = firstWeekday(viewYear, viewMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const isSelectedMonth =
    parsed && parsed.year === viewYear && parsed.month === viewMonth;
  const isTodayMonth =
    today.getFullYear() === viewYear && today.getMonth() === viewMonth;

  return (
    <div className="relative flex-1 min-w-0" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-input border border-border rounded px-3 py-2 text-sm transition-colors hover:border-primary/50 focus:outline-none focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <CalendarIcon />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-72 rounded border border-border bg-card shadow-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft />
            </button>
            <span className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] uppercase tracking-wide text-muted-foreground py-1"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const selected = isSelectedMonth && parsed.day === day;
              const isToday = isTodayMonth && today.getDate() === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`h-8 w-full rounded text-sm transition-colors
                    ${selected
                      ? "bg-primary text-primary-foreground font-bold"
                      : isToday
                      ? "border border-primary/50 text-primary hover:bg-foreground/10"
                      : "text-foreground hover:bg-foreground/10"
                    }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between mt-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={clearValue}
              className="text-xs text-primary hover:underline"
            >
              Удалить
            </button>
            <button
              type="button"
              onClick={selectToday}
              className="text-xs text-primary hover:underline"
            >
              Сегодня
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground shrink-0"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
