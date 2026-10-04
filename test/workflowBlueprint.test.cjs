const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const directory = path.join(
  __dirname,
  '..',
  'power-automate',
  'kiwi-teams-replies'
);
const contract = JSON.parse(fs.readFileSync(
  path.join(directory, 'workflow-blueprint.json'),
  'utf8'
));
const definition = JSON.parse(fs.readFileSync(
  path.join(directory, 'operational-definition.json'),
  'utf8'
));
const serialized = JSON.stringify(definition);

function visitActions(actions, visitor, insideForeach = false) {
  for (const [name, action] of Object.entries(actions || {})) {
    const nestedInForeach = insideForeach || action.type === 'Foreach';
    visitor(name, action, insideForeach);
    visitActions(action.actions, visitor, nestedInForeach);
    visitActions(action.else?.actions, visitor, nestedInForeach);
  }
}

function actionNamed(expectedName) {
  let result;
  visitActions(definition.actions, (name, action) => {
    if (name === expectedName) {
      result = action;
    }
  });
  assert.ok(result, `Missing action ${expectedName}`);
  return result;
}

function deepestControlPath(actions) {
  const containers = new Set(['If', 'Foreach', 'Scope', 'Switch', 'Until']);
  let deepest = { depth: -1, path: [] };

  function walk(currentActions, parentControls = []) {
    for (const [name, action] of Object.entries(currentActions || {})) {
      const path = [...parentControls, name];
      if (parentControls.length > deepest.depth) {
        deepest = { depth: parentControls.length, path };
      }
      const nextParents = containers.has(action.type) ? path : parentControls;
      walk(action.actions, nextParents);
      walk(action.else?.actions, nextParents);
    }
  }

  walk(actions);
  return deepest;
}

test('operational definition uses verified tenant resources', () => {
  assert.equal(
    definition.parameters.TicketsListId.defaultValue,
    'f673fe2d-9733-46dd-9afe-4bf614c99202'
  );
  assert.equal(
    definition.parameters.ExchangesListId.defaultValue,
    '58aa42f2-6fa0-4df2-9a76-90189fece896'
  );
  assert.equal(
    definition.parameters.TeamId.defaultValue,
    '435074fb-2e8d-4c67-b06a-0359ddc5a939'
  );
  assert.equal(
    definition.parameters.ChannelId.defaultValue,
    '19:BM44z26OAyIXfxi0S1s4L4m5T2obLQX1-tAeZVxJ5gE1@thread.tacv2'
  );
});

test('operational definition uses supported exported connector schemas', () => {
  const operations = new Set();
  const connections = new Set();
  visitActions(definition.actions, (_name, action) => {
    const host = action.inputs?.host;
    if (host) {
      operations.add(host.operationId);
      connections.add(host.connectionName);
    }
  });
  assert.deepEqual([...connections].sort(), [
    'shared_conversionservice',
    'shared_office365users',
    'shared_sharepointonline',
    'shared_teams'
  ]);
  for (const operation of [
    'HttpRequest',
    'UserProfile_V2',
    'HtmlToText',
    'PostItem',
    'PatchItem',
    'GetItem'
  ]) {
    assert.ok(operations.has(operation), `Missing operation ${operation}`);
  }
});

test('future cutoff blocks historical processing and trigger runs serially', () => {
  assert.equal(actionNamed('Deployment_cutoff_UTC').inputs, '2099-12-31T00:00:00Z');
  assert.equal(definition.triggers.Recurrence.runtimeConfiguration.concurrency.runs, 1);
  assert.match(actionNamed('Activation_cutoff_is_invalid').expression, /2099-12-31/);
  assert.match(actionNamed('Reply_is_new_human_content').expression, /Deployment_cutoff_UTC/);
});

test('ticket and reply pages fail closed rather than truncate', () => {
  assert.match(
    actionNamed('List_ticket_roots').inputs.parameters['parameters/uri'],
    /\$top=51/
  );
  assert.match(
    actionNamed('List_Teams_replies').inputs.parameters.Uri,
    /replies\?\$top=50/
  );
  assert.match(actionNamed('Reply_page_limit_reached').expression, /@odata\.nextLink/);
  assert.equal(actionNamed('For_each_ticket').runtimeConfiguration.concurrency.repetitions, 1);
  assert.equal(actionNamed('For_each_reply').runtimeConfiguration.concurrency.repetitions, 1);
  assert.equal(actionNamed('Fail_ticket_page_limit').inputs.runStatus, 'Failed');
  assert.match(
    actionNamed('Set_reply_page_failure_message').inputs.value,
    /block each scheduled run/
  );
  assert.equal(actionNamed('Fail_run_after_serial_processing').inputs.runStatus, 'Failed');
});

test('human identity and effective EditListItems are checked', () => {
  assert.match(actionNamed('Reply_is_new_human_content').expression, /from.*user.*id/);
  assert.match(actionNamed('Reply_is_new_human_content').expression, /from.*application/);
  assert.equal(
    actionNamed('Get_Teams_author').inputs.host.operationId,
    'UserProfile_V2'
  );
  assert.match(
    actionNamed('Check_author_permission').inputs.parameters['parameters/uri'],
    /items\(.*For_each_ticket.*getUserEffectivePermissions/
  );
  const authorization = actionNamed('Author_and_requester_are_authorized').expression;
  assert.match(authorization, /div\(int.*4/);
  assert.match(authorization, /\?\['Low'\]/);
  assert.match(authorization, /\?\['GetUserEffectivePermissions'\]\?\['Low'\]/);
  assert.match(
    authorization,
    /\?\['d'\]\?\['GetUserEffectivePermissions'\]\?\['Low'\]/
  );
  assert.doesNotMatch(serialized, /laurent\.anciaux/i);
});

test('SourceMessageId is checked before durable processing', () => {
  assert.match(
    actionNamed('Find_exchange').inputs.parameters['parameters/uri'],
    /SourceMessageId/
  );
  assert.match(actionNamed('Source_message_is_unseen').expression, /length/);
  assert.equal(
    actionNamed('Create_processing_exchange').inputs.parameters['item/DeliveryState/Value'],
    'Processing'
  );
  const source = contract.requiredColumns.TicketExchanges
    .find(column => column.internalName === 'SourceMessageId');
  assert.equal(source.enforceUniqueValues, true);
});

test('a pending native-rule dispatch blocks a later public reply on the ticket', () => {
  assert.match(
    actionNamed('Find_pending_dispatch').inputs.parameters['parameters/uri'],
    /DeliveryState eq ''AwaitingNativeRule'' or DeliveryState eq ''Processing''/
  );
  assert.match(
    actionNamed('Author_and_requester_are_authorized').expression,
    /Find_pending_dispatch/
  );
  assert.match(
    actionNamed('Set_authorization_failure_message').inputs.value,
    /prior public reply/
  );
});

test('classification happens after HtmlToText with exact case-sensitive prefix', () => {
  assert.equal(actionNamed('Html_to_text').inputs.host.operationId, 'HtmlToText');
  const expression = actionNamed('Reply_is_public').expression;
  assert.match(expression, /equals\(outputs\('Plain_text'\),'@user'\)/);
  assert.match(expression, /'@user '/);
  assert.doesNotMatch(expression, /toLower/);
  assert.equal(actionNamed('Public_reply_text').inputs, "@trim(substring(outputs('Plain_text'),5))");
});

test('public replies outside 1-255 fail visibly and are never truncated', () => {
  const expression = actionNamed('Public_reply_length_is_valid').expression;
  assert.match(expression, /greater\(length/);
  assert.match(expression, /lessOrEquals\(length.*255/);
  assert.match(
    actionNamed('Set_length_failure_message').inputs.value,
    /Nothing was truncated or dispatched/
  );
});

test('dispatch stages and re-reads fields before token-only commit', () => {
  const stage = actionNamed('Stage_ticket_reply');
  assert.deepEqual(
    Object.keys(stage.inputs.parameters).sort(),
    ['dataset', 'id', 'item/TeamsReplyAgent/Claims', 'item/TeamsReplyText', 'table']
  );
  assert.match(actionNamed('Staged_values_are_current').expression, /Demandeur0/);
  assert.match(actionNamed('Staged_values_are_current').expression, /TeamsThreadId/);
  assert.match(actionNamed('Staged_values_are_current').expression, /replyToId/);
  assert.deepEqual(
    Object.keys(actionNamed('Commit_dispatch_token_only').inputs.parameters).sort(),
    ['dataset', 'id', 'item/TeamsReplyDispatchToken', 'table']
  );
  assert.deepEqual(
    actionNamed('Mark_exchange_awaiting_native_rule').runAfter,
    { Commit_dispatch_token_only: ['Succeeded'] }
  );
  assert.doesNotMatch(serialized, /R_x00e9_ponseaudemandeur/);
});

test('Terminate actions are never nested in a foreach', () => {
  const invalid = [];
  visitActions(definition.actions, (name, action, insideForeach) => {
    if (insideForeach && action.type === 'Terminate') {
      invalid.push(name);
    }
  });
  assert.deepEqual(invalid, []);
  assert.equal(actionNamed('Terminate_after_processing_failure').type, 'If');
  assert.equal(actionNamed('Fail_run_after_serial_processing').type, 'Terminate');
});

test('SetVariable actions never reference their assigned variable', () => {
  const violations = [];
  visitActions(definition.actions, (name, action) => {
    if (action.type !== 'SetVariable') {
      return;
    }
    const variableName = action.inputs.name;
    const value = String(action.inputs.value);
    if (value.includes(`variables('${variableName}')`)) {
      violations.push(name);
    }
  });
  assert.deepEqual(violations, []);
  assert.match(actionNamed('Reply_page_limit_reached').expression, /empty\(variables\('FailureCode'\)\)/);
  assert.match(actionNamed('Reply_is_new_human_content').expression, /empty\(variables\('FailureCode'\)\)/);
});

test('control nesting stays within the Power Automate limit', () => {
  const deepest = deepestControlPath(definition.actions);
  assert.equal(deepest.depth, 8);
  assert.deepEqual(deepest.path, [
    'For_each_ticket',
    'For_each_reply',
    'Reply_is_new_human_content',
    'Source_message_is_unseen',
    'Reply_is_public',
    'Public_reply_length_is_valid',
    'Author_and_requester_are_authorized',
    'Staged_values_are_current',
    'Commit_dispatch_token_only'
  ]);
});

test('contract exposes only the minimum additional state column', () => {
  assert.deepEqual(contract.requiredColumns.TicketExchanges, [
    {
      internalName: 'SourceMessageId',
      type: 'Text',
      enforceUniqueValues: true,
      status: 'existing-and-verified'
    },
    {
      internalName: 'DeliveryState',
      type: 'Choice',
      choices: [
        'Processing',
        'AwaitingNativeRule',
        'AgentConfirmed',
        'FailedTerminal',
        'IgnoredInternal'
      ],
      status: 'existing-and-verified'
    }
  ]);
  assert.match(contract.failureSemantics.AwaitingNativeRule, /not proven delivered/);
  assert.match(contract.invariants.join('\n'), /never writes R_x00e9_ponseaudemandeur/);
});
