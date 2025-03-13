export class UftoTestType {
  private constructor(public readonly testType: string) { }

  public static readonly GUI = new UftoTestType("gui");
  public static readonly API = new UftoTestType("api");
  public static readonly None = new UftoTestType("none");

  public isNone(): boolean {
    return this.testType === UftoTestType.None.testType;
  }

  // Optional: Get all values
  public static values(): UftoTestType[] {
    return [UftoTestType.GUI, UftoTestType.API, UftoTestType.None];
  }

  // Optional: Get by type string
  public static fromType(type: string): UftoTestType | undefined {
    return UftoTestType.values().find(value => value.testType === type.toLowerCase());
  }

  public toString(): string {
    return this.testType.toUpperCase();
  }
}

export type UftTestTypeWrapper = typeof UftoTestType.GUI | typeof UftoTestType.API | typeof UftoTestType.None;