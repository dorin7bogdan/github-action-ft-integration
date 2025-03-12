export class ToolType {
  private constructor(public readonly toolType: string) { }

  public static readonly UFT = new ToolType("uft");
  public static readonly MBT = new ToolType("mbt");
  public static readonly None = new ToolType("none");

  public isNone(): boolean {
    return this.toolType === ToolType.None.toolType;
  }

  // Optional: Get all values
  public static values(): ToolType[] {
    return [ToolType.UFT, ToolType.MBT, ToolType.None];
  }

  // Optional: Get by type string
  public static fromType(type: string): ToolType {
    return ToolType.values().find(value => value.toolType === type.toLowerCase()) || ToolType.None;
  }
}

//export type ToolTypeWrapper = typeof ToolType.UFT | typeof ToolType.MBT | typeof ToolType.None;