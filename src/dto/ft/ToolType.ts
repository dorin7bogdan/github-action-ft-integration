export class ToolType {
  private constructor(public readonly toolType: string) { }

  public static readonly UFT = new ToolType("uft");
  public static readonly MBT = new ToolType("mbt");

  public toString(): string { return this.toolType; } 
}

//export type ToolTypeWrapper = typeof ToolType.UFT | typeof ToolType.MBT | typeof ToolType.None;