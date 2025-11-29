"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { useShifts } from "@/hooks/use-shifts"
import { useCaregivers } from "@/hooks/use-caregivers"

const chartConfig = {
  hours: {
    label: "Hours",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig

export default function CaregiverHoursChart() {
  const { shifts } = useShifts()
  const { caregivers } = useCaregivers()

  // Calculate hours for each caregiver from completed shifts this week
  const chartData = caregivers.map(caregiver => {
    const caregiverShifts = shifts.filter(shift =>
      shift.caregiverId === caregiver.id &&
      shift.status === 'Completed' &&
      new Date(shift.date) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    )

    const totalHours = caregiverShifts.reduce((total, shift) => {
      const start = new Date(`${shift.date}T${shift.startTime}`)
      const end = new Date(`${shift.date}T${shift.endTime}`)
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      return total + hours
    }, 0)

    return {
      caregiver: caregiver.name.split(' ')[0] + ' ' + (caregiver.name.split(' ')[1]?.charAt(0) || '') + '.',
      hours: Math.round(totalHours * 10) / 10 // Round to 1 decimal
    }
  }).filter(item => item.hours > 0) // Only show caregivers with hours

  if (chartData.length === 0) {
    return (
      <div className="h-[350px] w-full flex items-center justify-center text-muted-foreground">
        No hours logged this week
      </div>
    )
  }

  return (
    <div className="h-[350px] w-full">
      <ChartContainer config={chartConfig}>
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="caregiver"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            tickFormatter={(value) => value.slice(0, 3)}
          />
          <YAxis />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent indicator="dashed" />}
          />
          <Bar dataKey="hours" fill="var(--color-hours)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
