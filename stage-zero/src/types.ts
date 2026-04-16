export interface SuccessResponse {
  status: "success";
  data: GenderData;
}

export interface ErrorResponse {
  status: "error";
  message: string;
}

export interface GenderData {
  name: string;
  gender: "male" | "female";
  probability: number;
  sample_size: number;
  is_confident: boolean;
  processed_at: string;
}

export interface GenderizeApiRes {
  name: string;
  gender: "male" | "female" | null;
  probability: number;
  count: number;
}
export interface AgeData {
  name: string;
  age: number;
  count: number;
}
export interface NationalityData {
  name: string;
  country: Country[];
  count: number;
}
export interface Country {
  country_id: string;
  probability: number;
}

export type APIResponse = SuccessResponse | ErrorResponse;

export interface ExpectedProfileResponse {
  id: string;
  name: string;
  gender: string;
  age: number;
  age_group: string;
  country_id: string;
}
