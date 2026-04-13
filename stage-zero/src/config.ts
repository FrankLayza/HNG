
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
}
export interface GenderizeApiRes {
  name: string;
  gender: "male" | "female" | null;
  probability: number;
  count: number;
}

export type APIResponse = SuccessResponse | ErrorResponse;

export async function classifyName(
  name: string,
): Promise<APIResponse> {
  if (!name.trim()) {
    return {
      status: "error",
      message: "Name is required",
    };
  }

  try {
    const apiRes = await fetch(
      `https://api.genderize.io/?name=${encodeURIComponent(name)}`,
    );
    const data: GenderizeApiRes = await apiRes.json();
    if (!data.gender || data.count === 0) {
      return {
        status: "error",
        message: "No prediction available for the provided name",
      };
    }

    const newData = {
      name: data.name,
      gender: data.gender,
      probability: data.probability,
      sample_size: data.count,
      is_confident: data.probability >= 0.7 && data.count >= 100,
      processed_at: new Date().toISOString(),
    };
    return {
      status: "success",
      data: newData,
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to fetch prediction",
    };
  }
}
