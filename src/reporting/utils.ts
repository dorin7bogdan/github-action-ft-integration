import * as fs from 'fs';
import * as xml2js from 'xml2js';
import { UftResultStepData, UftResultIterationData, RunResultsSteps, ReportNode, UftResultStepParameter, Parameter } from './interfaces';

const notFinalNodeType = new Set(['Iteration', 'Action', 'Context']);

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, c => c.toLowerCase());
}

export async function getMBTData(file: string): Promise<RunResultsSteps[]> {
  const fileContent = fs.readFileSync(file, 'utf-8');
  const parser = new xml2js.Parser({
    mergeAttrs: true,
    explicitArray: false,
    explicitCharkey: false,
    tagNameProcessors: [toCamelCase],
    attrNameProcessors: [toCamelCase],
  });

  const r = await parser.parseStringPromise(fileContent);
  const reportNode = r.results?.reportNode as ReportNode;

  if (!reportNode) {
    throw new Error(`Failed to find UFT result data for file ${file}`);
  }

  const iterationRptNodes: ReportNode[] = [];
  getMBTIterationsInternal(reportNode, [], iterationRptNodes, 'Iteration', 2);

  const iterations: UftResultIterationData[] = iterationRptNodes.map(reportNode => {
    const steps: UftResultStepData[] = [];
    getMBTDataInternal(reportNode, [], steps, 'Action', 3);
    return { steps, duration: reportNode.data.duration ?? 0 };
  });

  return convertIterationsToRunResults(iterations);
}

function convertIterationsToRunResults(iterations: UftResultIterationData[]): RunResultsSteps[] {
  return iterations.map(uftIteration => {
    const steps = uftIteration.steps.map(uftStep => {
      const { parents, result, message, duration, inputParameters, outputParameters } = uftStep;
      return {
        name: parents[parents.length - 1],
        status: result,
        errorMessage: message,
        duration,
        inputParameters: inputParameters || [],
        outputParameters: outputParameters || [],
      };
    });
    return { steps, duration: uftIteration.duration };
  });
}

function getMBTIterationsInternal(node: ReportNode, parents: string[], results: ReportNode[], nodeType: string, targetLevel: number): void {
  parents.push(node.data.name || '');

  if (parents.length === targetLevel && nodeType === node.type) {
    results.push(node);
  }

  if (node.reportNode && parents.length < targetLevel) {
    const children = Array.isArray(node.reportNode) ? node.reportNode : [node.reportNode];
    children.forEach(n => getMBTIterationsInternal(n, [...parents], results, nodeType, targetLevel));
  }
}

function getMBTDataInternal(node: ReportNode, parents: string[], results: UftResultStepData[], nodeType: string, targetLevel: number): void {
  parents.push(node.data.name || '');

  const failed = /failed|warning/i.test(node.data.result || '');

  if (parents.length === targetLevel && nodeType === node.type) {
    let errorMessage = '';
    if (failed) {
      const errors: UftResultStepData[] = [];
      getErrorDataInternal(node, [...parents], errors);
      errorMessage = getAggregatedErrorMessage(errors);
    }

    const { inputParameters, outputParameters, duration, result } = node.data;
    const status = /warning/i.test(result) ? 'Passed' : result || 'Passed';

    // Helper function to normalize parameters
    const normalizeParameters = (params?: { parameter: Parameter | Parameter[] }): UftResultStepParameter[] => {
      const paramOrParams = params?.parameter;
      if (!paramOrParams) {
        return [];
      }

      return Array.isArray(paramOrParams) ? paramOrParams.map(p => ({ ...p })) : [{ ...paramOrParams }];
    };

    results.push({
      parents,
      type: node.type,
      result: status,
      message: errorMessage,
      duration: duration ?? 0,
      inputParameters: normalizeParameters(inputParameters),
      outputParameters: normalizeParameters(outputParameters)
    });
  }

  if (node.reportNode && parents.length < targetLevel) {
    const children = Array.isArray(node.reportNode) ? node.reportNode : [node.reportNode];
    children.forEach(n => getMBTDataInternal(n, [...parents], results, nodeType, targetLevel));
  }
}

function getErrorDataInternal(node: ReportNode, parents: string[], errors: UftResultStepData[]): void {
  parents.push(node.data.name || '');

  const hasDescription = isNotEmpty(node.data.description);
  const failed = /failed|warning/i.test(node.data.result || '');

  if (failed) {
    if (!notFinalNodeType.has(node.type) && hasDescription) {
      let error = isNotEmpty(node.data.errorText) ? node.data.errorText : node.data.description;
      error = error
        ?.replace("Verify that this object's properties match an object currently displayed in your application.", '')
        .replace(/\n/g, '')
        .replace(/\u00A0/g, ' ')
        .trim();

      if (parents?.length && error?.startsWith(parents[parents.length - 1])) {
        parents.pop();
      }
      errors.push({
        parents,
        type: node.type,
        result: node.data.result || 'Failed',
        message: error || '',
        duration: node.data.duration ?? 0,
      });
    }
    if (node.reportNode) {
      const children = Array.isArray(node.reportNode) ? node.reportNode : [node.reportNode];
      children.forEach(n => getErrorDataInternal(n, [...parents], errors));
    }
  }
}

function getAggregatedErrorMessage(errors: UftResultStepData[]): string {
  return errors
    .map(e => e.message.trim() + (/warning/i.test(e.result) ? ' (Warning)' : '') + (e.message.trim().endsWith('.') ? '' : '. '))
    .filter((msg, index, self) => self.indexOf(msg) === index)
    .join('\n');
}

function isNotEmpty(str: string | null | undefined): boolean {
  return str ? str.length > 0 : false;
}