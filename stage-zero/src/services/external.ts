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
  gender: "male" | "female" ;
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

export function getProcessedAt(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
export async function getAgeData(name: string): Promise<AgeData> {
  try {
    const apiRes = await fetch(
      `https://api.agify.io?name=${encodeURIComponent(name)}`,
    );
    if (!apiRes.ok) {
      throw new Error();
    }
    const data = await apiRes.json();
    if (!data?.age) {
      throw new Error();
    }
    return data;
  } catch (error) {
    throw new Error();
  }
}
export async function getNationality(name: string): Promise<NationalityData> {
  try {
    const apiRes = await fetch(
      `https://api.nationalize.io?name=${encodeURIComponent(name)}`,
    );
    if (!apiRes.ok) {
      throw new Error();
    }
    const data = await apiRes.json();
    if (!data.country) {
      throw new Error();
    }
    return data;
  } catch (error) {
    throw new Error();
  }
}

export async function classifyName(name: string): Promise<APIResponse> {
  try {
    const apiRes = await fetch(
      `https://api.genderize.io/?name=${encodeURIComponent(name)}`,
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

export async function getGender(name: string): Promise<GenderData> {
  try {
    const apiRes = await fetch(
      `https://api.genderize.io/?name=${encodeURIComponent(name)}`,
    );
    if (!apiRes.ok) {
      throw new Error();
    }
    const data = await apiRes.json();
    if (!data.gender || data.count === 0) {
      throw new Error();
    }
    return data;
  } catch (error) {
    throw new Error();
  }
}

export async function getAllProfile(
  name: string,
): Promise<[AgeData, NationalityData, GenderData]> {
  const [ageRes, countryRes, genderRes] = await Promise.all([
    getAgeData(name),
    getNationality(name),
    getGender(name),
  ]);
  return [ageRes, countryRes, genderRes];
}
