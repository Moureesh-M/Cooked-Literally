export interface RecipeResult {
  name: string;
  time: string;
  servings: string;
  dishes: string;
  ingredients: string[];
  suggested_ingredients?: string[];
  steps: string[];
  payoff: string;
  chef_notes?: string;
  safety_notes?: string;
  effort_level?: string;
  source?: string;
  fallback_reason?: string | null;
}

export type EffortLevel = 'aint_cookin' | 'can_cook' | 'ramsay';
