/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, { Component } from 'react';
import {
  Button,
  ListView,
  Platform,
  StyleSheet,
  Text,
  TouchableHighlight,
  View
} from 'react-native';
import Realm from 'realm';

const instructions = Platform.select({
  ios: 'Press Cmd+R to reload,\n' +
    'Cmd+D or shake for dev menu',
  android: 'Double tap R on your keyboard to reload,\n' +
    'Shake or press menu button for dev menu',
});

type Props = {};

const TestObjectSchema = {
  name: "TestObject",
  properties: {
    int: "int",
    double: "double",
    date: "date",
    string: "string"
  }
}

const numTestObjects = 100;
const numBatchTestObjects = numTestObjects * 1000;
const numRepeats = 1;
const numQueryBuckets = 100;

const tests = ["insertions", "binsertions", "enumeration", "querycount", "queryenum"];
const expectedCounts = {
  insertions: numTestObjects,
  binsertions: numBatchTestObjects,
  enumeration: numBatchTestObjects,
  querycount: numBatchTestObjects,
  queryenum: numBatchTestObjects
};
const expectedResults = {
  insertions: numTestObjects,
  binsertions: numBatchTestObjects,
  enumeration: numBatchTestObjects,
  querycount: numBatchTestObjects / (numQueryBuckets * 2),
  queryenum: numBatchTestObjects / (numQueryBuckets * 2)
};

class Tests {
  async setup(testName) {
    var count = await this.count();
    if (testName == 'enumeration' || testName == 'querycount' || testName == 'queryenum') {
      if (count != expectedCounts[testName]) {
        throw "Incorrect count " + count + " for test " + testName;
      }
    }
    else {
      if (count !=  0) {
        throw "Initial count should be 0 for insertion tests";
      }
    }
  }

  async binsertions() {
    return await this.batchInsert(this.testObjects(numBatchTestObjects));
  }

  objectValues(object) {
    return Object.keys(TestObjectSchema.properties).map((prop) => object[prop])
  }

  testObjects(count) {
    var objects = [];
    for (let i = 0; i < count; i++) {
      objects.push({ int: i % numQueryBuckets, double: i, date: new Date(i), string: "" + i });
    }
    return objects;
  }
}

class RealmTests extends Tests {
  constructor() {
    super();
    this.name = 'Realm';
  }

  async setup(testName) {
    if (testName == "insertions" || testName == "binsertions") {
      Realm.clearTestState();
    }
    this.realm = new Realm({schema: [TestObjectSchema]});

    await super.setup(testName);
  }

  async insertions() {
    var realm = this.realm;
    var objects = this.testObjects(numTestObjects);
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      realm.write(() => {
        realm.create("TestObject", obj);
      });
    }
    return numTestObjects;
  }

  async batchInsert(objects) {
    var realm = this.realm;
    realm.write(() => {
      for (var i = 0; i < objects.length; i++) {
        var obj = objects[i];
        realm.create("TestObject", obj);
      }
    });
    return objects.length;
  }

  async enumeration() {
    let objects = this.realm.objects('TestObject');
    let len = objects.length;
    for (let i = 0; i < len; i++) {
      var obj = objects[i];
      obj.int;
      obj.double;
      obj.date;
      obj.string;
    }
    return len;
  }

  async querycount() {
    let objects = this.realm.objects('TestObject').filtered('int = 0 and double < ' + numBatchTestObjects / 2);
    return objects.length;
  }

  async queryenum() {
    let objects = this.realm.objects('TestObject').filtered('int = 0 and double < ' + numBatchTestObjects / 2);
    let len = objects.length;
    for (let i = 0; i < len; i++) {
      var obj = objects[i];
      obj.int;
      obj.double;
      obj.date;
      obj.string;
    }
    return len;
  }

  async count() {
    return this.realm.objects('TestObject').length;
  }
}

const apiTests = [new RealmTests];

class ReactNativeBenchmarks extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      dataSource: new ListView.DataSource({
        rowHasChanged: (row1, row2) => row1 !== row2,
      }),
      running: false,
    };

    this._renderRow = this._renderRow.bind(this);
    this._runTests = this._runTests.bind(this);
  }

  render() {
    return (
        <View style={styles.container}>
          <Text style={styles.title}>
            ReactNative Storage Benchmarks
          </Text>
          <Button title='Start' onPress={this._runTests} />

          <ListView contentContainerStyle={styles.list}
                    dataSource={this.state.dataSource}
                    renderRow={this._renderRow}
          />
        </View>
    );
  }

  _renderRow(rowData) {
    return (
        <Text style={styles.item}>{rowData.join('\t\t')}</Text>
    );
  }

  async _runTests() {
    if (this.state.running) {
      console.log("DISABLED");
      return;
    }

    this.setState({running: true});

    try {
      await this._runTestsAsync();
    } catch (e) {
      console.error('Error running tests:', e);
    }

    this.setState({running: false});
  }

  async _runTestsAsync() {
    var data = [apiTests.map((api) => api.name)];
    data[0].splice(0, 0, "\t\t");
    for (var i = 0; i < tests.length; i++) {
      var test = tests[i];
      data.push([test]);
      this.setState({
        dataSource: this.state.dataSource.cloneWithRows(data),
      });

      for (var j = 0; j < apiTests.length; j++) {
        var apiTest = apiTests[j];
        var totalTime = 0;
        console.log("Running " + apiTest.name + "." + test);
        for (var k = 0; k < numRepeats; k++) {
          await apiTest.setup(test);

          var startTime = Date.now();
          var result = await apiTest[test]();
          var endTime = Date.now();

          if (result != expectedResults[test]) {
            throw "Incorrect result " + result + " for test " + apiTest.name + "." + test;
          }

          var count = await apiTest.count();
          if (count != expectedCounts[test]) {
            throw "Incorrect count " + count + " for test " + apiTest.name + "." + test;
          }

          var time = endTime - startTime
          console.log("finished in " + time);
          totalTime += time;
        }

        data = data.slice();
        let last = data.length-1;
        data[last] = data[last].slice();
        data[last].push(totalTime / numRepeats);

        this.setState({
          dataSource: this.state.dataSource.cloneWithRows(data),
        });
      }
    }
  }
}


export default class App extends Component<Props> {


  start() {
    class Person {}
    Person.schema = {
      name: 'Person',
      primaryKey: 'name',
      properties: {
        name: 'string',
        age: {type: 'int', default: 0},
      },
    };

    const realm = new Realm({schema: [Person]});

// Query
    let people = realm.objects('Person').filtered('age >= 17');
    people.length // => 0

// Write
    realm.write(() => {
      savedPerson = realm.create('Person', {
        name: 'Hal Incandenza',
        age: 17,
      });
    });

// Queries are updated in real-time
    // => 1
    console.warn(people.length);
  }

  render() {
    return (
        <View style={styles.container}>

          <ReactNativeBenchmarks />

        </View>
    );
  }
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
    margin: 20,
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 5,
  },
  list: {
    justifyContent: 'center',
    flexDirection: 'column',
    flexWrap: 'wrap',
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#CCC',
    width: 100,
    height: 40
  },
  row: {
    flexDirection: 'row',
  },
  item: {
    textAlign: 'center',
    padding: 3,
    margin: 3,
    fontSize: 12
  },
});
