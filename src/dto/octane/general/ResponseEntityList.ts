import { EntityList } from './EntityList';

export class ResponseEntityList extends EntityList {
  private totalCount: number = 0;
  private exceedsTotalCount: boolean = false;

  public getTotalCount(): number {
    return this.totalCount;
  }

  public getExceedsTotalCount(): boolean {
    return this.exceedsTotalCount;
  }

  public setTotalCount(totalCount: number): this {
    this.totalCount = totalCount;
    return this;
  }

  public setExceedsTotalCount(exceedsTotalCount: boolean): this {
    this.exceedsTotalCount = exceedsTotalCount;
    return this;
  }
}