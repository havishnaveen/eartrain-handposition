import json

with open("bach1.json", "r") as f:
    data = json.load(f)

for measure in data["exercise_measures"]:
    m_num = measure["measure_number"]
    
    # Check Right Hand
    rh_total = sum(n["duration_beats"] for n in measure["right_hand"]["notes"])
    # Check Left Hand
    lh_total = sum(n["duration_beats"] for n in measure["left_hand"]["notes"])
    
    print(f"Measure {m_num}: RH Beats = {rh_total:.2f} | LH Beats = {lh_total:.2f}")
    
    assert rh_total == 4.0, f"Error in Measure {m_num} RH!"
    assert lh_total == 4.0, f"Error in Measure {m_num} LH!"

print("All measures mathematically balanced!")
