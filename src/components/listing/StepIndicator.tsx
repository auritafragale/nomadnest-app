import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  number: number;
  title: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  /** When true, every step is clickable regardless of the current position. */
  allowJumpAhead?: boolean;
}

const StepIndicator = ({ steps, currentStep, onStepClick, allowJumpAhead = false }: StepIndicatorProps) => {
  return (
    <div className="w-full flex items-start">
      {steps.map((step, index) => (
        <Fragment key={step.number}>
          <div className="flex flex-col items-center flex-1">
            <button
              onClick={() => onStepClick?.(step.number)}
              disabled={!allowJumpAhead && step.number > currentStep}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full font-medium transition-all",
                step.number < currentStep
                  ? "bg-primary text-primary-foreground cursor-pointer"
                  : step.number === currentStep
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {step.number < currentStep ? (
                <Check className="w-5 h-5" />
              ) : (
                step.number
              )}
            </button>
            <span
              className={cn(
                "text-xs font-medium transition-colors mt-2 text-center",
                step.number === currentStep
                  ? "text-primary"
                  : step.number < currentStep
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {step.title}
            </span>
          </div>

          {index < steps.length - 1 && (
            <div
              className={cn(
                "h-1 flex-1 rounded-full transition-colors mt-[18px] mx-1",
                step.number < currentStep ? "bg-primary" : "bg-muted"
              )}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
};

export default StepIndicator;
