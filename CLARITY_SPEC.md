1. What is the current spec version?  
1.0.0

2. What is a breaking change? (3 examples)  
A breaking change means an older valid `clarity.json` no longer works as-is.
- Renaming a required field (for example, `output.classes` to `output.labels`).
- Changing a field type (for example, `thresholds.possible_finding` from number to string).
- Making a previously optional field required for all models.

3. What is a non-breaking change? (3 examples)  
A non-breaking change means older valid files still load the same way.
- Adding a new optional field.
- Improving validation error text without changing accepted file structure.
- Adding optional metadata that old runtimes can ignore safely.

4. When a v1 model is loaded in a v2 runtime, what happens?  
The v2 runtime should either load it through a clear v1 compatibility path or stop with a clear migration error. It should not silently reinterpret fields.

5. Who is allowed to bump the major version?  
Only project maintainers (repo owners or code owners) through a reviewed pull request.

6. What is the migration path when a breaking change is required?  
Publish the new schema, provide a v1→v2 converter, keep v1 read support for a transition period, document the changes, then remove v1 support in a later major release.