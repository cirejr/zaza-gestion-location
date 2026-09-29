"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { caretForDigitIndex, formatAmountInput } from "@/lib/amount"

type AmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: string
  onValueChange: (value: string) => void
}

/**
 * Integer amount field that groups digits as you type (`150000` -> `150 000`).
 * The caret stays anchored to the digits around it so formatting mid-value does
 * not jump the cursor to the end.
 */
export function AmountInput({ value, onValueChange, ...props }: AmountInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const caretRef = React.useRef<number | null>(null)

  // Runs after the newly formatted value has been committed to the DOM.
  React.useLayoutEffect(() => {
    const caret = caretRef.current
    if (caret === null) return
    caretRef.current = null
    inputRef.current?.setSelectionRange(caret, caret)
  }, [value])

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(event) => {
        const caret = event.currentTarget.selectionStart ?? event.currentTarget.value.length
        const digitsBeforeCaret = event.currentTarget.value.slice(0, caret).replace(/\D/g, "").length
        const formatted = formatAmountInput(event.currentTarget.value)
        caretRef.current = caretForDigitIndex(formatted, digitsBeforeCaret)
        onValueChange(formatted)
      }}
      {...props}
    />
  )
}
