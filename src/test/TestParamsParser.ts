import ToolType from "../dto/ft/ToolType";
import TestData from "./TestData";
import TestParserFactory from "./TestParserFactory";
import { Logger } from "../utils/logger";
const _logger = new Logger("TestParamsParser");

export default class TestParamsParser {
  public static parseTestData(testData: string, framework: ToolType = ToolType.MBT): Map<number, TestData> {
    _logger.debug(`Parsing test data: ${testData} with framework: ${framework}`);
    const strTestParam = this.calcByExpression(testData, "^v1:(.+)$", 1);
    const arrTestParam = strTestParam.split(";");
    const testDataMap = new Map<number, TestData>();

    arrTestParam.forEach(param => {
      try {
        const testParts = param.split("|");
        const parsedTestData = TestParserFactory.getParser(framework).parseTestParam(testParts);
        testDataMap.set(parsedTestData.runId, parsedTestData);
      } catch (e) {
        throw new Error(`Failed to save string: ${(e as Error).message}`);
      }
    });

    return testDataMap;
  }

  public static calcByExpression(param: string, regex: string, groupNum: number): string {
    _logger.debug(`Apply regex: ${regex} on param: ${param} for group number: ${groupNum}`);
    const rxTemplate = new RegExp(regex);
    const match = param.match(rxTemplate);

    if (match) {
      return match[groupNum];
    }
    return param;
  }
}