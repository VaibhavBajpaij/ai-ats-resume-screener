import processedDataset from "@/data/processed-resumes.json";
import { DashboardClient } from "@/components/DashboardClient";
import { ProcessedDatasetSchema } from "@/lib/schemas";

export default function HomePage() {
  const dataset = ProcessedDatasetSchema.parse(processedDataset);
  return <DashboardClient dataset={dataset} />;
}

