export enum UftoParamDirection {
  IN = 0,
  OUT = 1
}

export namespace UftoParamDirection {
  const valueMap: { [key: number]: string } = {
    [UftoParamDirection.IN]: "IN",
    [UftoParamDirection.OUT]: "OUT"
  };

  export function getName(num: number): string | null {
    return valueMap[num] ?? null;
  }
}