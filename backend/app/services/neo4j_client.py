from neo4j import GraphDatabase
from app.config import settings

class Neo4jClient:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password)
        )

    def close(self):
        self.driver.close()

    def run_query(self, query: str, parameters: dict = None) -> list:
        with self.driver.session() as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]

    def init_indexes(self, embedding_dim: int = 1536):
        # Create standard index constraints
        queries = [
            "CREATE INDEX log_ts_idx IF NOT EXISTS FOR (n:Log) ON (n.ts)",
            "CREATE INDEX log_severity_idx IF NOT EXISTS FOR (n:Log) ON (n.severity)",
            "CREATE INDEX log_node_idx IF NOT EXISTS FOR (n:Log) ON (n.node)"
        ]
        
        with self.driver.session() as session:
            for q in queries:
                session.run(q)
                
            # Create full-text index on Log message (for fallback lex search)
            # Fulltext indexes in Neo4j 5 are created via:
            # CREATE FULLTEXT INDEX name IF NOT EXISTS FOR (n:Label) ON EACH [n.prop]
            session.run(
                "CREATE FULLTEXT INDEX log_msg_fulltext IF NOT EXISTS "
                "FOR (n:Log) ON EACH [n.msg]"
            )

            # Only drop+recreate the vector index when the embedding dimension
            # actually changed (e.g., user switched OpenAI ↔ MiniLM). Vector-index
            # rebuilds are expensive — doing them on every ingestion run kills
            # ingestion latency on large sessions.
            res = session.run("SHOW INDEXES")
            existing_dim: int | None = None
            for record in res:
                if record["name"] != "log_embedding_idx":
                    continue
                options = record.get("options") or {}
                index_config = options.get("indexConfig") if isinstance(options, dict) else None
                if isinstance(index_config, dict):
                    dim = index_config.get("vector.dimensions")
                    if isinstance(dim, int):
                        existing_dim = dim
                break

            if existing_dim is not None and existing_dim != embedding_dim:
                try:
                    session.run("DROP INDEX log_embedding_idx")
                except Exception:
                    pass

            # Create vector index (no-op when an existing one matches dimension)
            vector_query = f"""
            CREATE VECTOR INDEX log_embedding_idx IF NOT EXISTS
            FOR (n:Log)
            ON (n.embedding)
            OPTIONS {{
              indexConfig: {{
                `vector.dimensions`: {embedding_dim},
                `vector.similarity_function`: 'cosine'
              }}
            }}
            """
            session.run(vector_query)

    def clear_session(self, session_id: str):
        # Delete Session, its Logs, Topics, Anomalies, Frames, Sensors, and Diagnostics
        query = """
        MATCH (s:Session {id: $session_id})
        OPTIONAL MATCH (s)-[:HAS_LOG]->(l:Log)
        OPTIONAL MATCH (s)-[:HAS_TOPIC]->(t:Topic)
        OPTIONAL MATCH (s)-[:HAS_ANOMALY]->(a:Anomaly)
        OPTIONAL MATCH (s)-[:HAS_SENSOR]->(sen:Sensor)
        OPTIONAL MATCH (s)-[:HAS_DIAGNOSTIC]->(d:DiagnosticStatus)
        OPTIONAL MATCH (f:Frame {session_id: $session_id})
        DETACH DELETE s, l, t, a, sen, d, f
        """
        with self.driver.session() as session:
            session.run(query, {"session_id": session_id})
            
    def write_sensors(self, session_id: str, sensors: list[dict]):
        if not sensors:
            return
        query = """
        MATCH (s:Session {id: $session_id})
        UNWIND $sensors_list AS sensor_data
        CREATE (sen:Sensor {
            id: sensor_data.id,
            name: sensor_data.name,
            topic: sensor_data.topic,
            type: sensor_data.type,
            msg_type: sensor_data.msg_type,
            session_id: $session_id
        })
        CREATE (s)-[:HAS_SENSOR]->(sen)
        """
        with self.driver.session() as session:
            session.run(query, {"session_id": session_id, "sensors_list": sensors})

    def write_diagnostics(self, session_id: str, diagnostics: list[dict]):
        if not diagnostics:
            return
        query = """
        MATCH (s:Session {id: $session_id})
        UNWIND $diagnostics_list AS diag_data
        CREATE (d:DiagnosticStatus {
            id: diag_data.id,
            ts: diag_data.t,
            level: diag_data.level,
            name: diag_data.name,
            message: diag_data.message,
            hardware_id: diag_data.hardware_id,
            values_json: diag_data.values_json,
            topic: diag_data.topic,
            session_id: $session_id
        })
        CREATE (s)-[:HAS_DIAGNOSTIC]->(d)
        
        // Link to Sensor if the name or hardware_id matches the sensor's name/topic
        WITH d, diag_data
        OPTIONAL MATCH (sen:Sensor {session_id: $session_id})
        WHERE sen.topic = diag_data.topic 
           OR sen.name = diag_data.hardware_id 
           OR diag_data.name CONTAINS sen.name
        FOREACH (_ IN CASE WHEN sen IS NULL THEN [] ELSE [1] END |
            CREATE (d)-[:REPORTS_ON]->(sen)
        )
        """
        with self.driver.session() as session:
            session.run(query, {"session_id": session_id, "diagnostics_list": diagnostics})
            
    def write_logs(self, session_id: str, logs: list[dict]):
        """
        Write a batch of logs and link them to the Session.

        Parser dicts use the mock-aligned field names `{id, t, sev, text, …}`
        (see `mock_design/data.jsx`); the graph schema stores them as the more
        verbose `{ts, severity, msg}`. Map the names here so the Cypher writes
        actual values instead of nulls.
        """
        query = """
        MATCH (s:Session {id: $session_id})
        UNWIND $logs_list AS log_data
        CREATE (l:Log {
            id: log_data.id,
            ts: log_data.t,
            severity: log_data.sev,
            node: log_data.node,
            msg: log_data.text,
            topic: log_data.topic,
            type: log_data.type,
            embedding: log_data.embedding
        })
        CREATE (s)-[:HAS_LOG]->(l)
        """
        with self.driver.session() as session:
            session.run(query, {"session_id": session_id, "logs_list": logs})

    def write_topics(self, session_id: str, topics: list[dict]):
        query = """
        MATCH (s:Session {id: $session_id})
        UNWIND $topics_list AS topic_data
        CREATE (t:Topic {
            name: topic_data.name,
            type: topic_data.type,
            hz: topic_data.hz,
            total_messages: topic_data.msgs
        })
        CREATE (s)-[:HAS_TOPIC]->(t)
        """
        with self.driver.session() as session:
            session.run(query, {"session_id": session_id, "topics_list": topics})

    def write_frames(self, session_id: str, frames: list[dict]):
        # frames list is: [{"name": str, "parent": str}]
        query = """
        UNWIND $frames_list AS frame_data
        MERGE (f:Frame {name: frame_data.name, session_id: $session_id})
        WITH f, frame_data
        WHERE frame_data.parent IS NOT NULL
        MERGE (p:Frame {name: frame_data.parent, session_id: $session_id})
        MERGE (f)-[:CHILD_OF]->(p)
        """
        with self.driver.session() as session:
            session.run(query, {"session_id": session_id, "frames_list": frames})
            
    def create_session_node(self, session_id: str, filename: str, robot_id: str, duration_s: float, started_at: str):
        query = """
        CREATE (s:Session {
            id: $session_id,
            filename: $filename,
            robot_id: $robot_id,
            duration_s: $duration_s,
            started_at: $started_at
        })
        """
        with self.driver.session() as session:
            session.run(query, {
                "session_id": session_id,
                "filename": filename,
                "robot_id": robot_id,
                "duration_s": duration_s,
                "started_at": started_at
            })

    def write_anomalies(self, session_id: str, anomalies: list[dict]):
        """
        Write :Anomaly nodes for a session, link them to the Session, and
        wire `[:DERIVED_FROM]` edges back to the source Log when available.

        Phase 3 sources these from `timeline_events[type=='anomaly']`. Phase 5
        AnomalyDetector worker will append additional entries via the same shape.
        """
        if not anomalies:
            return
        query = """
        MATCH (s:Session {id: $session_id})
        UNWIND $anomalies_list AS a
        CREATE (anomaly:Anomaly {
            id: a.id,
            ts: a.t,
            kind: a.kind,
            severity: a.severity,
            source_log_id: a.source_log_id,
            confidence: a.confidence,
            topic: a.topic,
            label: a.label
        })
        CREATE (s)-[:HAS_ANOMALY]->(anomaly)
        WITH anomaly, a
        WHERE a.source_log_id IS NOT NULL
        OPTIONAL MATCH (l:Log {id: a.source_log_id})
        FOREACH (_ IN CASE WHEN l IS NULL THEN [] ELSE [1] END |
            CREATE (anomaly)-[:DERIVED_FROM]->(l)
        )
        """
        with self.driver.session() as session:
            session.run(query, {"session_id": session_id, "anomalies_list": anomalies})

    def write_edges(self, edges: list[dict]):
        query_caused = """
        UNWIND $edges_list AS edge
        MATCH (source:Log {id: edge.source_id})
        MATCH (target:Log {id: edge.target_id})
        MERGE (source)-[r:CAUSED {
            rule_id: edge.properties.rule_id,
            confidence: edge.properties.confidence,
            lag_ms: edge.properties.lag_ms
        }]->(target)
        """
        query_triggered = """
        UNWIND $edges_list AS edge
        MATCH (source:Log {id: edge.source_id})
        MATCH (target:Log {id: edge.target_id})
        MERGE (source)-[r:TRIGGERED {
            rule_id: edge.properties.rule_id,
            confidence: edge.properties.confidence,
            lag_ms: edge.properties.lag_ms
        }]->(target)
        """
        query_concurrent = """
        UNWIND $edges_list AS edge
        MATCH (source:Log {id: edge.source_id})
        MATCH (target:Log {id: edge.target_id})
        MERGE (source)-[r:CONCURRENT_WITH {
            lag_ms: edge.properties.lag_ms
        }]->(target)
        """
        caused_list = [e for e in edges if e["type"] == "CAUSED"]
        triggered_list = [e for e in edges if e["type"] == "TRIGGERED"]
        concurrent_list = [e for e in edges if e["type"] == "CONCURRENT_WITH"]
        
        with self.driver.session() as session:
            if caused_list:
                session.run(query_caused, {"edges_list": caused_list})
            if triggered_list:
                session.run(query_triggered, {"edges_list": triggered_list})
            if concurrent_list:
                session.run(query_concurrent, {"edges_list": concurrent_list})

neo4j_client = Neo4jClient()
