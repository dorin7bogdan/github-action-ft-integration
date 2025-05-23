import { EntityConstants } from './EntityConstants';
import { ResponseEntityList } from './ResponseEntityList';
const { ID, NAME, TYPE, COLLECTION_DATA, COLLECTION_TOTAL_COUNT } = EntityConstants.Base;

export class Entity {

  private fields: Map<string, any> = new Map();

  public getField(fieldName: string): any {
    return this.fields.get(fieldName);
  }

  public setField(fieldName: string, fieldValue: any): this {
    let myFieldValue = fieldValue;

    if (fieldValue instanceof Map) {
      const map = fieldValue as Map<string, any>;
      if (map.has(TYPE)) {
        myFieldValue = this.deserializeEntityFromMap(map);
      } else if (map.has(COLLECTION_DATA) && map.has(COLLECTION_TOTAL_COUNT)) {
        myFieldValue = this.deserializeEntityListFromMap(map);
      }
    }
    this.fields.set(fieldName, myFieldValue);
    return this;
  }

  private deserializeEntityListFromMap(map: Map<string, any>): ResponseEntityList {
    const list = new ResponseEntityList();
    list.setTotalCount(map.get(COLLECTION_TOTAL_COUNT) as number);
    const data = map.get(COLLECTION_DATA) as Map<string, any>[];
    for (const entry of data) {
      const entity = this.deserializeEntityFromMap(entry);
      list.addEntity(entity);
    }
    return list;
  }

  private deserializeEntityFromMap(map: Map<string, any>): Entity {
    const entity = new Entity();
    for (const [key, value] of map.entries()) {
      entity.setField(key, value);
    }
    return entity;
  }

  public getId(): string {
    return this.getField(ID) as string;
  }

  public setId(id: string): this {
    this.setField(ID, id);
    return this;
  }

  public getName(): string {
    return this.getField(NAME) as string;
  }

  public setName(name: string): this {
    this.setField(NAME, name);
    return this;
  }

  public getType(): string {
    return this.getField(TYPE) as string;
  }

  public setType(type: string): this {
    this.setField(TYPE, type);
    return this;
  }

  public getStringValue(fieldName: string): string {
    return this.getField(fieldName) as string;
  }

  public getLongValue(fieldName: string): number {
    return this.getField(fieldName) as number;
  }

  public getEntityValue(fieldName: string): Entity {
    return this.getField(fieldName) as Entity;
  }

  public getBooleanValue(fieldName: string): boolean {
    return this.getField(fieldName) as boolean;
  }

  public containsField(fieldName: string): boolean {
    return this.fields.has(fieldName);
  }

  public containsFieldAndValue(fieldName: string): boolean {
    return this.fields.has(fieldName) && this.fields.get(fieldName) != null;
  }

  public getFields(): Map<string, any> {
    return this.fields;
  }

  public toString(): string {
    let sb = '';
    if (this.fields.has(TYPE)) {
      sb += this.getType();
      if (this.fields.has(ID)) {
        sb += `, #${this.getId()}`;
      }
    }

    if (this.fields.has(NAME)) {
      if (sb.length > 0) {
        sb += ' - ';
      }
      sb += this.getName();
    }
    return sb.length > 0 ? sb : Object.prototype.toString.call(this);
  }
}