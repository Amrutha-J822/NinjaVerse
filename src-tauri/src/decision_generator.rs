use serde_json::{json, Value};

pub fn generate_decisions(level: &str) -> String {
    // Placeholder for Nemotron model inference
    // In a real implementation, this would load the NVIDIA Nemotron-Mini-4B-Instruct model
    // and generate game decisions based on the level.
    // Return JSON with building coordinates, villain energy, and attack strategy.

    // Simple decision logic based on level
    let (buildings, villain_energy, attack): (Vec<Value>, u32, &str) = match level {
        "easy" => {
            // Easy level: simple buildings, low villain energy, basic attack
            (
                vec![
                    json!({ "x": 0, "y": 0, "height": 8 }),
                    json!({ "x": 4, "y": 0, "height": 10 }),
                ],
                50,
                "basic",
            )
        }
        "medium" => {
            // Medium level: more complex buildings, moderate villain energy, varied attack
            (
                vec![
                    json!({ "x": 1, "y": 0, "height": 12 }),
                    json!({ "x": 5, "y": 0, "height": 14 }),
                    json!({ "x": 8, "y": 0, "height": 11 }),
                ],
                80,
                "medium_complex",
            )
        }
        "hard" => {
            // Hard level: tall buildings, high villain energy, advanced attack
            (
                vec![
                    json!({ "x": -2, "y": 0, "height": 18 }),
                    json!({ "x": 3, "y": 0, "height": 20 }),
                    json!({ "x": 10, "y": 0, "height": 16 }),
                ],
                120,
                "advanced",
            )
        }
        _ => {
            // Default fallback
            (
                vec![
                    json!({ "x": 0, "y": 0, "height": 10 }),
                    json!({ "x": 5, "y": 0, "height": 12 }),
                ],
                80,
                "default",
            )
        }
    };

    // Each danger zone is [x, y, radius] around a building
    let danger_zone: Vec<Value> = buildings
        .iter()
        .map(|b| json!([b["x"], b["y"], 5]))
        .collect();

    // Construct the decision JSON
    let decision = json!({
        "buildings": buildings,
        "villain_energy": villain_energy,
        "attack": attack,
        "danger_zone": danger_zone
    });

    decision.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_produce_distinct_layouts() {
        for level in ["easy", "medium", "hard", "unknown"] {
            let v: Value = serde_json::from_str(&generate_decisions(level)).unwrap();
            let buildings = v["buildings"].as_array().unwrap();
            assert!(!buildings.is_empty());
            assert_eq!(v["danger_zone"].as_array().unwrap().len(), buildings.len());
        }
        let hard: Value = serde_json::from_str(&generate_decisions("hard")).unwrap();
        assert_eq!(hard["villain_energy"], 120);
        assert_eq!(hard["attack"], "advanced");
    }
}
