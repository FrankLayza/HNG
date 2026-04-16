import { Country } from "../services/external.js";
export function getAgeGroup(age: number): string {
  if (age >= 0 && age <= 12) {
    return "child";
  } else if (age >= 13 && age <= 19) {
    return "teenager";
  } else if (age >= 20 && age <= 59) {
    return "adult";
  } else {
    return "senior";
  }
}

export function getTopCountry(countries: Country[]) {
  const highestCountry = countries.reduce((prev, current) =>
    prev.probability > current.probability ? prev : current,
  );
  return highestCountry
}
