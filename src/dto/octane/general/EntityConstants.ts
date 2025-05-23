export class EntityConstants {
  public static Errors = {
    DUPLICATE_ERROR_CODE: 'platform.duplicate_entity_error',
  } as const;

  public static Base = {
    ID: 'id',
    NAME: 'name',
    LOGICAL_NAME: 'logical_name',
    DESCRIPTION: 'description',
    TYPE: 'type',
    SUBTYPE: 'subtype',
    COLLECTION_DATA: 'data',
    COLLECTION_TOTAL_COUNT: 'total_count'
  } as const;

  public static AutomatedTest = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'automated_tests',
    ENTITY_NAME: 'automated_test',
    TEST_RUNNER: 'test_runner',
    SCM_REPOSITORY: 'scm_repository',
    TESTING_TOOL_TYPE: 'testing_tool_type',
    TEST_TYPE: 'test_type',
    FRAMEWORK: 'framework',
    PACKAGE: 'package',
    CLASS_NAME: 'class_name',
    EXECUTABLE: 'executable'
  } as const;

  public static MbtUnit = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'model_items',
    ENTITY_NAME: 'model_item',
    ENTITY_SUBTYPE: 'unit',
    PARENT: 'parent',
    AUTOMATION_STATUS: 'automation_status',
    REPOSITORY_PATH: 'repository_path',
    TESTING_TOOL_TYPE: 'testing_tool_type',
    TEST_RUNNER: 'test_runner',
    SCM_REPOSITORY: 'scm_repository'
  } as const;

  public static MbtUnitParameter = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'entity_parameters',
    ENTITY_NAME: 'entity_parameter',
    ENTITY_SUBTYPE: 'unit_parameter',
    MODEL_ITEM: 'model_item',
    TYPE: 'parameter_type',
    DEFAULT_VALUE: 'value'
  } as const;

  public static ModelFolder = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'model_items',
    ENTITY_NAME: 'model_item',
    ENTITY_SUBTYPE: 'model_folder',
    PARENT: 'parent',
    TEST_RUNNER: 'test_runner',
  } as const;

  public static ScmResourceFile = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'scm_resource_files',
    ENTITY_NAME: 'scm_resource_file',
    RELATIVE_PATH: 'relative_path',
    SCM_REPOSITORY: 'scm_repository',
  } as const;

  public static ScmRepository = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'scm_repositories',
    ENTITY_NAME: 'scm_repository',
  } as const;

  public static Executors = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'executors',
    ENTITY_NAME: 'executor',
    SYNC_STATUS_PASSED: '{"type": "list_node", "id": "list_node.sync_status.success"}',
    SYNC_STATUS_FAILED: '{"type": "list_node", "id": "list_node.sync_status.failed"}',
  } as const;

  public static Artifact = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'fte_artifacts',
    ENTITY_NAME: 'fte_artifact',
    FILE_NAME: 'file_name',
    SIZE: 'size',
    FTE_ID: 'fte_id',
    UPLOAD_BY: 'upload_by',
    UPLOAD_DATE: 'upload_date',
    CLOUD_TEST_RUNNER: 'cloud_test_runner',
    VERSION: 'version',
  } as const;

  public static ArtifactUploadPhase = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'fte_artifact_upload_phases',
    ENTITY_NAME: 'fte_artifact_upload_phase',
    PHASE_NAME: 'upload_phase',
    ERROR_MESSAGE: 'error_message',
    START_TIME: 'start_time',
    FTE_ARTIFACT_ID: 'fte_artifact_id',
  } as const;

  public static ScmRepositoryRoot = {
    ...EntityConstants.Base,
    COLLECTION_NAME: 'scm_repository_roots',
  } as const;
}