import { Entity } from './Entity';

export class EntityList {
  private data: Entity[] = [];

  public getData(): Entity[] {
    return this.data;
  }

  public setData(data: Entity[]): this {
    this.data = data ?? [];
    return this;
  }

  public addEntity(entity: Entity): this {
    this.data.push(entity);
    return this;
  }
}