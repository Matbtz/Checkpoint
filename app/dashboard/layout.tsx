
import DataEnricher from "@/components/system/DataEnricher"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <DataEnricher />
      {children}
    </>
  )
}
