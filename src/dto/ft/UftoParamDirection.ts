export enum UftoParamDirection {
  IN = 0,
  OUT = 1
}

export namespace UftoParamDirection {
  const valueMap: { [key: number]: UftoParamDirection } = {
    [UftoParamDirection.IN]: UftoParamDirection.IN,
    [UftoParamDirection.OUT]: UftoParamDirection.OUT
  };

  export function get(num: number): UftoParamDirection | null {
    return valueMap[num] ?? null;
  }
}