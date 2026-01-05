import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";

interface HLTBCardProps {
  hltbMain: number | null;
  hltbExtra: number | null;
  hltbCompletionist: number | null;
  userPlaytime?: number | null; // In minutes
  predictedMain?: number | null; // In hours
  predictedExtra?: number | null; // In hours
  predictedCompletionist?: number | null; // In hours
}

export function HLTBCard({
  hltbMain,
  hltbExtra,
  hltbCompletionist,
  userPlaytime,
  predictedMain,
  predictedExtra,
  predictedCompletionist
}: HLTBCardProps) {
  // If no data at all (neither HLTB nor Predicted), return null
  const hasHltb = hltbMain || hltbExtra || hltbCompletionist;
  const hasPredicted = predictedMain || predictedExtra || predictedCompletionist;

  if (!hasHltb && !hasPredicted) return null;

  // Convert user playtime to hours for comparison
  const userHours = userPlaytime ? Math.round((userPlaytime / 60) * 10) / 10 : 0;

  // Calculate percentage of main story completed
  // Use HLTB if available, otherwise Predicted
  const referenceTime = hltbMain ? (hltbMain / 60) : (predictedMain || 0);

  const progressPercent = referenceTime > 0
    ? Math.min(100, (userHours / referenceTime) * 100)
    : 0;

  // --- Hybrid Logic ---
  // Determine a "Reference Main" time to base other estimates on.
  // Priority: HLTB Main -> Derived from HLTB Extra -> Derived from HLTB Comp -> Predicted Main

  let referenceMain = predictedMain ? predictedMain : 0;
  let calculationSource: "Main" | "Extra" | "Comp" | "Model" = "Model";

  if (hltbMain) {
    referenceMain = hltbMain / 60;
    calculationSource = "Main";
  } else if (hltbExtra && predictedExtra && predictedMain && predictedExtra > 0) {
    // Derive Main from Extra: Main = Extra / (PredExtra/PredMain)
    const ratio = predictedExtra / predictedMain;
    referenceMain = (hltbExtra / 60) / ratio;
    calculationSource = "Extra";
  } else if (hltbCompletionist && predictedCompletionist && predictedMain && predictedCompletionist > 0) {
    // Derive Main from Comp: Main = Comp / (PredComp/PredMain)
    const ratio = predictedCompletionist / predictedMain;
    referenceMain = (hltbCompletionist / 60) / ratio;
    calculationSource = "Comp";
  }

  // Helper to calculate target times based on the established referenceMain
  const getSimulatedTime = (target: "Extra" | "Comp") => {
    if (!predictedMain || predictedMain <= 0) return null;
    if (target === "Extra") {
      const ratio = (predictedExtra || 0) / predictedMain;
      return referenceMain * ratio;
    }
    if (target === "Comp") {
      const ratio = (predictedCompletionist || 0) / predictedMain;
      return referenceMain * ratio;
    }
    return null;
  };

  // Determine final display values
  const displayMain = hltbMain ? (hltbMain / 60) : (referenceMain || null);

  const displayExtra = hltbExtra
    ? (hltbExtra / 60)
    : (calculationSource !== "Model" ? getSimulatedTime("Extra") : (predictedExtra || null));

  const displayCompletionist = hltbCompletionist
    ? (hltbCompletionist / 60)
    : (calculationSource !== "Model" ? getSimulatedTime("Comp") : (predictedCompletionist || null));

  // Flags for UI labels
  const isHybridMain = !hltbMain && (calculationSource === "Extra" || calculationSource === "Comp");
  const isHybridExtra = !hltbExtra && calculationSource !== "Model";
  const isHybridComp = !hltbCompletionist && calculationSource !== "Model";

  const getLabel = (isHybrid: boolean) => {
    if (!isHybrid) return "Predictive model";
    if (calculationSource === "Main") return "Based on Main";
    if (calculationSource === "Extra") return "Based on Extra";
    if (calculationSource === "Comp") return "Based on 100%";
    return "Predictive model";
  };

  const renderTimeBlock = (label: string, hltb: number | null, displayVal: number | null, isHybrid: boolean, predictedVal: number | null) => {
    // If we are showing a hybrid value, we shouldn't show the "Pred" hint since the main value IS the prediction/hybrid.
    // If we are showing HLTB, we show "Pred" hint.
    // If we are showing purely Predictor (isHybrid=false, no hltb), we show "Predictive model".

    return (
      <div className="flex flex-col gap-1 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 min-h-[80px] justify-center relative overflow-hidden">
        <span className="text-xs text-zinc-500 font-medium uppercase">{label}</span>

        {hltb ? (
          <div className="flex flex-col items-center">
            <span className="font-bold text-lg">{Math.round(hltb / 60)}h</span>
            {predictedVal && (
              <span className="text-[10px] text-zinc-400/70" title="Estimated by Predictive Model">
                Pred: {Math.round(predictedVal)}h
              </span>
            )}
          </div>
        ) : displayVal ? (
          <div className="flex flex-col items-center">
            <span className="font-bold text-lg text-amber-600/90 dark:text-amber-500/90">{Math.round(displayVal)}h</span>
            <span className="text-[9px] text-zinc-400 leading-tight px-1 text-center">
              {getLabel(isHybrid)}
            </span>
          </div>
        ) : (
          <span className="font-bold text-lg text-zinc-300 dark:text-zinc-700">--</span>
        )}
      </div>
    );
  };

  return (
    <Card className="bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm border-zinc-200/50 dark:border-zinc-800/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <Clock className="w-4 h-4" />
          Time To Beat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {renderTimeBlock("Main", hltbMain, displayMain, isHybridMain, predictedMain || null)}
          {renderTimeBlock("Extra", hltbExtra, displayExtra, isHybridExtra, predictedExtra || null)}
          {renderTimeBlock("100%", hltbCompletionist, displayCompletionist, isHybridComp, predictedCompletionist || null)}
        </div>

        {userHours > 0 && hltbMain && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-zinc-600 dark:text-zinc-400">Your Progress</span>
              <span>{userHours}h / {hltbMain}h</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
