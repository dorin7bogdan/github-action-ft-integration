import TestData from "./TestData";
import TestParamsParser from "./TestParamsParser";
import TestParser from "./TestParser";

export default class MbtTestParser implements TestParser {
  parseTestParam(param: string[]): TestData {
    if (param.length < 5 || !param[4].includes('mbtData')) {
      throw new Error("The chosen test runner is incompatible with the chosen framework");
    }
    const testData: TestData = {
      packageSource: param[0],
      className: param[1],
      testName: param[2],
      runId: parseInt(TestParamsParser.calcByExpression(param[3], "^runId=(.+)$", 1), 10),
      mbtData: param[4] ? TestParamsParser.calcByExpression(param[4], "^mbtData=(.+)$", 1) : undefined
    };
    return testData;
  }
}
