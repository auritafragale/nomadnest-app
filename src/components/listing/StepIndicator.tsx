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
}

const StepIndicator = ({ steps, currentStep, onStepClick }: StepIndicatorProps) => {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <button
              onClick={() => onStepClick?.(step.number)}
              disabled={step.number > currentStep}
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
            
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-1 mx-3 rounded-full transition-colors",
                  step.number < currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        ))}
      </div>
      
      <div className="flex justify-between mt-2">
        {steps.map((step) => (
          <span
            key={step.number}
            className={cn(
              "text-xs font-medium transition-colors",
              step.number === currentStep
                ? "text-primary"
                : step.number < currentStep
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            {step.title}
          </span>
        ))}
      </div>
    </div>
  );
};

export default StepIndicator;
