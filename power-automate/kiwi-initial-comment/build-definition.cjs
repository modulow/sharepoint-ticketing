'use strict';

// Generates the native definition; no tenant calls or connection credentials.
const fs = require('node:fs');
const path = require('node:path');
const succeeded = name => ({ [name]: ['Succeeded'] });
const action = (type, inputs, after) => ({ type, ...(after ? { runAfter: succeeded(after) } : {}), inputs });
const compose = (inputs, after) => action('Compose', inputs, after);
const set = (name, value, after) => action('SetVariable', { name, value }, after);
const condition = (expression, actions, otherwise = {}, after) => ({
  type: 'If', ...(after ? { runAfter: succeeded(after) } : {}), expression, actions, else: { actions: otherwise }
});
const fail = message => set('FailureMessage', message);
const http = (method, uri, body, after, headers = {}) => ({
  type: 'OpenApiConnection',
  ...(after ? { runAfter: succeeded(after) } : {}),
  inputs: {
    parameters: {
      dataset: "@parameters('SiteUrl')",
      'parameters/method': method,
      'parameters/uri': uri,
      'parameters/headers': {
        Accept: 'application/json;odata=minimalmetadata',
        ...(method === 'POST' ? { 'Content-Type': 'application/json;odata=nometadata' } : {}),
        ...headers
      },
      ...(body !== undefined ? { 'parameters/body': body } : {})
    },
    host: {
      apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline',
      connectionName: 'shared_sharepointonline', operationId: 'HttpRequest'
    },
    authentication: "@parameters('$authentication')",
    retryPolicy: { type: 'none' }
  },
  runtimeConfiguration: { secureData: { properties: ['inputs', 'outputs'] } }
});
const source = "@concat('/_api/web/lists(guid''',parameters('TicketsListId'),''')/";
const ledger = "@concat('/_api/web/lists(guid''',parameters('LedgerListId'),''')/";
const itemUri = `${source}items(',string(items('For_each_ticket')?['Id']),')`;
const ledgerQuery = `${ledger}items?$select=Id,Title,State,Payload&$filter=Title eq ''',outputs('Copy_key'),'''&$top=2')`;
const commentUri = `${itemUri}/comments?$top=100')`;
const snapshot = "@setProperty(setProperty(setProperty(setProperty(json('{}'),'key',outputs('Copy_key')),'ticketId',items('For_each_ticket')?['Id']),'state','Pending'),'text',variables('CommentText'))";

function enumerate(prefix, after) {
  const names = {
    reset: `${prefix}_reset_matches`, next: `${prefix}_set_next`, pages: `${prefix}_reset_pages`,
    loop: `${prefix}_pages`, read: `${prefix}_read_page`, validate: `${prefix}_validate_page`,
    matches: `${prefix}_matching_comments`, append: `${prefix}_append_matches`, candidate: `${prefix}_candidate_next`,
    check: `${prefix}_validate_next`, count: `${prefix}_next_count`, saveCount: `${prefix}_save_count`
  };
  return {
    [names.reset]: set('Matches', [], after),
    [names.next]: set('NextCommentUri', commentUri, names.reset),
    [names.pages]: set('CommentPageCount', 0, names.next),
    [names.loop]: {
      type: 'Until', runAfter: succeeded(names.pages),
      expression: "@or(empty(variables('NextCommentUri')),not(empty(variables('FailureMessage'))))",
      limit: { count: 100, timeout: 'PT10M' },
      actions: {
        [names.read]: http('GET', "@variables('NextCommentUri')"),
        [names.validate]: condition(
          `@not(equals(body('${names.read}')?['value'],null))`,
          {
            [names.matches]: {
              type: 'Query',
              inputs: { from: `@body('${names.read}')?['value']`, where: "@contains(coalesce(item()?['text'],''),outputs('Copy_marker'))" }
            },
            [names.append]: {
              type: 'Foreach', foreach: `@body('${names.matches}')`,
              runAfter: succeeded(names.matches),
              runtimeConfiguration: { concurrency: { repetitions: 1 } },
              actions: { [`${prefix}_append_match`]: action('AppendToArrayVariable', { name: 'Matches', value: '@item()' }) }
            },
            [names.candidate]: compose(`@coalesce(body('${names.read}')?['odata.nextLink'],body('${names.read}')?['@odata.nextLink'],'')`, names.append),
            [names.count]: compose("@add(variables('CommentPageCount'),1)", names.candidate),
            [names.saveCount]: set('CommentPageCount', `@outputs('${names.count}')`, names.count),
            [names.check]: condition(
              `@or(empty(outputs('${names.candidate}')),and(less(variables('CommentPageCount'),100),startsWith(outputs('${names.candidate}'),concat(parameters('SiteUrl'),replace(${commentUri.slice(1)},'?$top=100','?'))),not(equals(outputs('${names.candidate}'),variables('NextCommentUri')))))`,
              { [`${prefix}_advance`]: set('NextCommentUri', `@outputs('${names.candidate}')`) },
              { [`${prefix}_fail_continuation`]: fail('Comment pagination incomplete, repeated, over bound or outside this item. No partial success or replay.') },
              names.saveCount
            )
          },
          { [`${prefix}_fail_page`]: fail('Invalid native comment page. No partial success.') },
          names.read
        )
      }
    }
  };
}

const stages = {};
let previous = 'Copy_marker';
function stage(name, actions) {
  stages[name] = condition("@empty(variables('FailureMessage'))", actions, {}, previous);
  previous = name;
}
stage('Resolve_saved_snapshot', {
  Read_ledger: http('GET', ledgerQuery),
  Ledger_page_valid: condition("@and(lessOrEquals(length(body('Read_ledger')?['value']),1),empty(body('Read_ledger')?['odata.nextLink']),empty(body('Read_ledger')?['@odata.nextLink']))", {
    Ledger_exists: condition("@equals(length(body('Read_ledger')?['value']),1)", {
      Parse_saved_payload: compose("@json(first(body('Read_ledger')?['value'])?['Payload'])"),
      Saved_payload_valid: condition("@and(equals(outputs('Parse_saved_payload')?['key'],outputs('Copy_key')),equals(outputs('Parse_saved_payload')?['ticketId'],items('For_each_ticket')?['Id']),equals(outputs('Parse_saved_payload')?['state'],first(body('Read_ledger')?['value'])?['State']),contains(createArray('Pending','Completed'),outputs('Parse_saved_payload')?['state']),endsWith(outputs('Parse_saved_payload')?['text'],outputs('Copy_marker')))", {
        Save_record: set('SavedRecord', "@outputs('Parse_saved_payload')"),
        Save_text: set('CommentText', "@outputs('Parse_saved_payload')?['text']", 'Save_record'),
        Save_ledger_id: set('LedgerItemId', "@int(first(body('Read_ledger')?['value'])?['Id'])", 'Save_text')
      }, { Fail_bad_saved_payload: fail('Invalid saved copy identity/state/text; operator review required.') }, 'Parse_saved_payload')
    }, {
      Read_current_ticket: http('GET', `${itemUri}?$select=Id,Created,Descriptif')`),
      Source_snapshot_valid: condition("@and(equals(body('Read_current_ticket')?['Id'],items('For_each_ticket')?['Id']),equals(ticks(body('Read_current_ticket')?['Created']),ticks(items('For_each_ticket')?['Created'])),not(empty(trim(coalesce(body('Read_current_ticket')?['Descriptif'],'')))))", {
        Description_is_rich: condition("@equals(body('Read_description_metadata')?['RichText'],true)", {
          Html_to_text: {
            type: 'OpenApiConnection',
            inputs: {
              parameters: { Content: "@body('Read_current_ticket')?['Descriptif']" },
              host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_conversionservice', connectionName: 'shared_conversionservice', operationId: 'HtmlToText' },
              authentication: "@parameters('$authentication')"
            },
            runtimeConfiguration: { secureData: { properties: ['inputs', 'outputs'] } }
          },
          Save_converted_description: set('DescriptionText', "@body('Html_to_text')", 'Html_to_text')
        }, { Save_plain_description: set('DescriptionText', "@body('Read_current_ticket')?['Descriptif']") }),
        Complete_comment_text: compose("@concat('Learn IT Helpdesk - Descriptif initial du demandeur',decodeUriComponent('%0A%0A'),variables('DescriptionText'),decodeUriComponent('%0A%0A'),outputs('Copy_marker'))", 'Description_is_rich'),
        Full_text_valid: condition("@and(not(empty(trim(variables('DescriptionText')))),lessOrEquals(length(outputs('Complete_comment_text')),parameters('VerifiedCommentLimit')))", {
          Save_complete_text: set('CommentText', "@outputs('Complete_comment_text')")
        }, { Fail_empty_or_oversized: fail('Empty converted Descriptif or complete comment over approved limit. Nothing truncated or posted.') }, 'Complete_comment_text')
      }, { Fail_not_finalized: fail('Descriptif not finalized or source identity changed. No reservation; a later finalized modification may be admitted.') }, 'Read_current_ticket')
    })
  }, { Fail_ledger_page: fail('Ledger lookup ambiguous or incomplete; no comment write.') }, 'Read_ledger')
});
stage('Enumerate_before_write', enumerate('Before'));
stage('Reserve_and_post_once', {
  New_copy: condition("@equals(variables('LedgerItemId'),0)", {
    No_orphan_marker: condition("@equals(length(variables('Matches')),0)", {
      Pending_snapshot: compose(snapshot),
      Reserve_pending: http('POST', `${ledger}items')`, "@setProperty(setProperty(setProperty(json('{}'),'Title',outputs('Copy_key')),'State','Pending'),'Payload',string(outputs('Pending_snapshot')))", 'Pending_snapshot'),
      Save_reserved_id: set('LedgerItemId', "@int(body('Reserve_pending')?['Id'])", 'Reserve_pending'),
      Save_reserved_record: set('SavedRecord', "@outputs('Pending_snapshot')", 'Save_reserved_id'),
      Post_native_comment: http('POST', `${itemUri}/comments')`, "@setProperty(json('{}'),'text',variables('CommentText'))", 'Save_reserved_record'),
      Recover_uncertain_reservation: {
        ...http('GET', ledgerQuery),
        runAfter: { Reserve_pending: ['Failed', 'TimedOut'] }
      },
      Reservation_recovery_valid: {
        ...condition("@and(equals(length(body('Recover_uncertain_reservation')?['value']),1),empty(body('Recover_uncertain_reservation')?['odata.nextLink']),empty(body('Recover_uncertain_reservation')?['@odata.nextLink']))", {
          Fail_reservation_uncertain: fail('Reservation conflict or uncertainty. State retained. Next run may reconcile only; no POST authorized.')
        }, { Fail_reservation_missing: fail('Reservation failed and no unique ledger visible; inspect secured run. No comment posted.') }),
        runAfter: succeeded('Recover_uncertain_reservation')
      }
    }, { Fail_orphan_marker: fail('Native marker exists without ledger; operator review, no duplicate.') })
  })
});
stage('Enumerate_after_write', enumerate('After'));
stage('Complete_verified_copy', {
  Exactly_one_marked_comment: condition("@equals(length(variables('Matches')),1)", {
    Exact_text_and_id: condition("@and(equals(first(variables('Matches'))?['text'],variables('CommentText')),not(empty(string(coalesce(first(variables('Matches'))?['id'],'')))))", {
      Read_ledger_version: http('GET', `${ledger}items(',string(variables('LedgerItemId')),')?$select=Id,Title,State,Payload')`),
      Current_payload: compose("@json(body('Read_ledger_version')?['Payload'])", 'Read_ledger_version'),
      Current_etag: compose("@coalesce(outputs('Read_ledger_version')?['headers']?['ETag'],body('Read_ledger_version')?['odata.etag'],body('Read_ledger_version')?['@odata.etag'],'')", 'Current_payload'),
      Snapshot_unchanged: condition("@and(equals(body('Read_ledger_version')?['Title'],outputs('Copy_key')),equals(outputs('Current_payload')?['key'],outputs('Copy_key')),equals(outputs('Current_payload')?['ticketId'],items('For_each_ticket')?['Id']),equals(outputs('Current_payload')?['text'],variables('CommentText')),equals(outputs('Current_payload')?['state'],body('Read_ledger_version')?['State']),not(empty(outputs('Current_etag'))),not(equals(outputs('Current_etag'),'*')))", {
        Already_completed: condition("@equals(body('Read_ledger_version')?['State'],'Completed')", {
          Completed_identity_matches: condition("@equals(outputs('Current_payload')?['commentId'],string(first(variables('Matches'))?['id']))", {}, { Fail_completed_identity: fail('Completed native comment identity changed.') })
        }, {
          Pending_only: condition("@equals(body('Read_ledger_version')?['State'],'Pending')", {
            Complete_ledger: http('POST', `${ledger}items(',string(variables('LedgerItemId')),')')`, "@setProperty(setProperty(json('{}'),'State','Completed'),'Payload',string(setProperty(setProperty(outputs('Current_payload'),'state','Completed'),'commentId',string(first(variables('Matches'))?['id']))))", undefined, { 'IF-MATCH': "@outputs('Current_etag')", 'X-HTTP-Method': 'MERGE' })
          }, { Fail_invalid_state: fail('Ledger state is not Pending or Completed.') })
        })
      }, { Fail_changed_snapshot: fail('Ledger snapshot or ETag invalid; no completion update.') }, 'Current_etag')
    }, { Fail_changed_comment: fail('Native comment text changed or ID absent. Do not replay.') })
  }, { Fail_missing_comment: fail('Native comment absent or ambiguous. Pending retained; no automatic replay.') })
});

const definition = {
  $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
  contentVersion: '1.0.0.0',
  parameters: {
    $authentication: { type: 'SecureObject', defaultValue: {} },
    $connections: { type: 'Object', defaultValue: {} },
    SiteUrl: { type: 'String', defaultValue: 'https://europarl.sharepoint.com/sites/learn.IT-Kiwi' },
    TicketsListId: { type: 'String', defaultValue: 'f673fe2d-9733-46dd-9afe-4bf614c99202' },
    LedgerListId: { type: 'String', defaultValue: '' },
    ActivationCutoffUtc: { type: 'String', defaultValue: '2099-12-31T00:00:00Z' },
    VerifiedCommentLimit: { type: 'Int', defaultValue: 0 }
  },
  triggers: { Recurrence: { type: 'Recurrence', recurrence: { frequency: 'Minute', interval: 1 }, runtimeConfiguration: { concurrency: { runs: 1 } } } },
  actions: {}
};
let initAfter;
for (const [name, type, value] of [
  ['FailureMessage', 'string', ''], ['LedgerItemId', 'integer', 0], ['CommentText', 'string', ''],
  ['DescriptionText', 'string', ''], ['SavedRecord', 'object', {}], ['Matches', 'array', []],
  ['NextCommentUri', 'string', ''], ['CommentPageCount', 'integer', 0]
]) {
  const nameOfAction = `Initialize_${name}`;
  definition.actions[nameOfAction] = action('InitializeVariable', { variables: [{ name, type, value }] }, initAfter);
  initAfter = nameOfAction;
}
definition.actions.Configuration_invalid = condition(
  "@or(equals(parameters('ActivationCutoffUtc'),'2099-12-31T00:00:00Z'),greater(ticks(parameters('ActivationCutoffUtc')),ticks(utcNow())),lessOrEquals(parameters('VerifiedCommentLimit'),0),not(equals(parameters('TicketsListId'),'f673fe2d-9733-46dd-9afe-4bf614c99202')),empty(parameters('LedgerListId')),equals(parameters('LedgerListId'),parameters('TicketsListId')))",
  { Fail_disabled: action('Terminate', { runStatus: 'Failed', runError: { code: 'ConfigurationDisabled', message: 'Set explicit ledger GUID, approved comment cap and deployment cutoff. No historical copying.' } }) }, {}, initAfter
);
definition.actions.Preflight = {
  type: 'Scope', runAfter: succeeded('Configuration_invalid'), actions: {
    Read_title_metadata: http('GET', `${ledger}fields/getbyinternalnameortitle(''Title'')')`),
    Read_payload_metadata: http('GET', `${ledger}fields/getbyinternalnameortitle(''Payload'')')`, undefined, 'Read_title_metadata'),
    Read_state_metadata: http('GET', `${ledger}fields/getbyinternalnameortitle(''State'')')`, undefined, 'Read_payload_metadata'),
    Read_description_metadata: http('GET', `${source}fields/getbyinternalnameortitle(''Descriptif'')')`, undefined, 'Read_state_metadata'),
    Schema_valid: condition("@and(equals(body('Read_title_metadata')?['TypeAsString'],'Text'),equals(body('Read_title_metadata')?['EnforceUniqueValues'],true),equals(body('Read_title_metadata')?['Indexed'],true),equals(body('Read_payload_metadata')?['TypeAsString'],'Note'),equals(body('Read_payload_metadata')?['RichText'],false),equals(body('Read_payload_metadata')?['AppendOnly'],false),equals(body('Read_state_metadata')?['TypeAsString'],'Text'),or(equals(body('Read_description_metadata')?['TypeAsString'],'Text'),and(equals(body('Read_description_metadata')?['TypeAsString'],'Note'),contains(createArray(true,false),body('Read_description_metadata')?['RichText']))))", {}, { Fail_schema: fail('Dedicated ledger or Descriptif field metadata invalid.') }, 'Read_description_metadata')
  }
};
definition.actions.Read_source_page = condition("@empty(variables('FailureMessage'))", {
  Read_new_tickets: http('GET', `${source}items?$select=Id,Created&$filter=Created ge datetime''',parameters('ActivationCutoffUtc'),''' and Created le datetime''',utcNow(),'''&$orderby=Id asc&$top=101')`)
}, {}, 'Preflight');
definition.actions.Check_source_page = condition("@empty(variables('FailureMessage'))", {
  Ticket_page_complete: condition("@and(lessOrEquals(length(body('Read_new_tickets')?['value']),100),empty(body('Read_new_tickets')?['odata.nextLink']),empty(body('Read_new_tickets')?['@odata.nextLink']))", {}, {
    Fail_ticket_pagination: fail('More than 100 post-cutoff tickets or ticket continuation present. No tickets processed; deployment requires source pagination before capacity is reached.')
  })
}, {}, 'Read_source_page');
definition.actions.For_each_ticket = {
          type: 'Foreach', foreach: "@body('Read_new_tickets')?['value']",
          runAfter: succeeded('Check_source_page'),
          runtimeConfiguration: { concurrency: { repetitions: 1 } },
          actions: {
              Reset_ledger_id: set('LedgerItemId', 0),
              Reset_saved_record: set('SavedRecord', {}, 'Reset_ledger_id'),
              Reset_description: set('DescriptionText', '', 'Reset_saved_record'),
              Reset_comment: set('CommentText', '', 'Reset_description'),
              Copy_key: compose("@concat('kiwi-initial-description:',parameters('TicketsListId'),':',string(items('For_each_ticket')?['Id']),':v1')", 'Reset_comment'),
              Copy_marker: compose("@concat('[',outputs('Copy_key'),']')", 'Copy_key'),
              ...stages
          }
};
definition.actions.For_each_ticket.foreach = "@coalesce(body('Read_new_tickets')?['value'],json('[]'))";
const workActions = Object.fromEntries(Object.entries(definition.actions).filter(([name]) => !name.startsWith('Initialize_')));
delete workActions.Configuration_invalid.runAfter;
for (const name of Object.keys(workActions)) delete definition.actions[name];
definition.actions.Native_copy_work = { type: 'Scope', runAfter: succeeded(initAfter), actions: workActions };
definition.actions.Fail_connector_or_post = {
  ...action('Terminate', { runStatus: 'Failed', runError: { code: 'InitialCommentActionFailed', message: 'A connector, parsing or write failed. Inspect secured run and durable Pending state. Never reset/replay a native comment or email.' } }),
  runAfter: { Native_copy_work: ['Failed', 'TimedOut'] }
};
definition.actions.Finish = condition("@not(empty(variables('FailureMessage')))", {
  Fail_validation: action('Terminate', { runStatus: 'Failed', runError: { code: 'InitialCommentGuard', message: "@variables('FailureMessage')" } })
}, {}, 'Native_copy_work');
module.exports = definition;
if (require.main === module) fs.writeFileSync(path.join(__dirname, 'operational-definition.json'), `${JSON.stringify(definition, null, 2)}\n`);
