"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const chartData = [
  { caregiver: "Alice J.", hours: 40 },
  { caregiver: "Bob W.", hours: 25 },
  { caregiver: "Charlie B.", hours: 32 },
  { caregiver: "Diana M.", hours: 18 },
  { caregiver: "Ethan D.", hours: 38 },
]

const chartConfig = {
  hours: {
    label: "Hours",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig

export default function CaregiverHoursChart() {
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
