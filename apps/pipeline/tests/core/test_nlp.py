from pipeline import utils
from scripts.seeding.import_election_history import normalize_name

def test_clean_person_name():
    # Standard prefixes
    assert utils.clean_person_name("Mayor David Screech") == "David Screech"
    assert utils.clean_person_name("Councillor Damian Kowalewich") == "Damian Kowalewich"
    assert utils.clean_person_name("Dr. M. Sherman") == "M. Sherman"
    
    # Complex/Multiple
    assert utils.clean_person_name("Acting Mayor Councillor Rogers") == "Rogers"
    # Note: Regex replaces one by one. "Acting Mayor " removes, then "Councillor " removes.
    
    # Job titles
    assert utils.clean_person_name("Director of Finance D. Christenson") == "D. Christenson"
    assert utils.clean_person_name("Planner L. Curtis") == "L. Curtis"
    
    # Parentheticals
    assert utils.clean_person_name("L. Chase (Director of Development Services)") == "L. Chase"
    
    # Edge cases
    assert utils.clean_person_name("Staff Member") == "Member" # "Staff" is removed
    assert utils.clean_person_name("David Screech") == "David Screech" # No change

def test_normalize_person_name():
    # Verify that clean + canonical works together
    assert utils.normalize_person_name("Mayor David Screech") == "David Screech"
    assert utils.normalize_person_name("M a y o r  H i l l") == "Graham Hill"
    assert utils.normalize_person_name("Councillor matson") == "Ron Mattson"

def test_extract_roles_from_name():
    # Simple Council
    roles = utils.extract_roles_from_name("Mayor David Screech")
    assert ("Mayor", "Council") in roles
    
    # Multiple Roles
    roles = utils.extract_roles_from_name("Acting Mayor Councillor Rogers")
    assert ("Acting Mayor", "Council") in roles
    assert ("Councillor", "Council") in roles
    
    # Staff / Directors
    roles = utils.extract_roles_from_name("Director of Finance D. Christenson")
    assert ("Director of Finance", "Staff") in roles
    # Verify we filtered out the generic "Director" subset
    assert ("Director", "Staff") not in roles
    
    # Parenthetical Roles
    roles = utils.extract_roles_from_name("L. Chase (Director of Development Services)")
    assert ("Director of Development Services", "Staff") in roles
    
    # Typos
    roles = utils.extract_roles_from_name("Councilor Lemon") # One 'l'
    assert ("Councillor", "Council") in roles

def test_normalize_election_name():
    assert normalize_name("Screech, David") == "David Screech"
    assert normalize_name("Mattson, Ron") == "Ron Mattson"
    assert normalize_name("Kowalewich, Damian") == "Damian Kowalewich"
    assert normalize_name("Sid Tobias") == "Sid Tobias"