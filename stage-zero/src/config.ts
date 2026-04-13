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
  gender: "male" | "female" | null;
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

export type APIResponse = SuccessResponse | ErrorResponse;

function getProcessedAt(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function classifyName(name: string): Promise<APIResponse> {
  try {
    const apiRes = await fetch(
      `https://api.genderize.io/?name=${encodeURIComponent(name)}`
    );

    if (!apiRes.ok) {
      return {
        status: "error",
        message: "Upstream or server failure",
      };
    }

    const data: GenderizeApiRes = await apiRes.json();
    if (!data.gender || data.count === 0) {
      return {
        status: "error",
        message: "No prediction available for the provided name",
      };
    }

    return {
      status: "success",
      data: {
        name: data.name,
        gender: data.gender,
        probability: data.probability,
        sample_size: data.count,
        is_confident: data.probability >= 0.7 && data.count >= 100,
        processed_at: getProcessedAt(),
      },
    };
  } catch {
    return {
      status: "error",
      message: "Upstream or server failure",
    };
  }
}