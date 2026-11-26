// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Локальный реестр проектов. Тексты и адреса общедоступны.
contract ProjectMatch {
    uint256 public constant MAX_PAGE_SIZE = 30;
    uint16 public constant MAX_CAPACITY = 30;

    enum Status { Pending, Accepted, Rejected }

    struct Project {
        uint256 id;
        address owner;
        string title;
        string description;
        string requiredSkills;
        uint16 capacity;
        uint16 acceptedCount;
        bool active;
        uint256 createdAt;
    }

    struct Application {
        address applicant;
        uint256 projectId;
        Status status;
        uint256 createdAt;
    }

    uint256 public projectCount;
    mapping(uint256 => Project) private projects;
    mapping(uint256 => mapping(address => Application)) private applications;
    mapping(uint256 => address[]) private projectApplicants;
    mapping(address => uint256[]) private userProjectIds;

    event ProjectCreated(uint256 indexed projectId, address indexed owner);
    event ApplicationSubmitted(uint256 indexed projectId, address indexed applicant);
    event ApplicationStatusChanged(
        uint256 indexed projectId, address indexed applicant, address indexed owner, Status status
    );
    event ProjectClosed(uint256 indexed projectId, address indexed owner);

    error ProjectNotFound();
    error ProjectInactive();
    error OnlyProjectOwner();
    error OwnProject();
    error ProjectFull();
    error DuplicateApplication();
    error ApplicationNotFound();
    error FinalApplication();
    error InvalidText();
    error InvalidCapacity();
    error InvalidPageSize();

    function createProject(
        string calldata title,
        string calldata description,
        string calldata requiredSkills,
        uint16 capacity
    ) external returns (uint256 id) {
        _checkText(title, 120);
        _checkText(description, 1200);
        _checkText(requiredSkills, 320);
        if (capacity == 0 || capacity > MAX_CAPACITY) revert InvalidCapacity();

        id = ++projectCount;
        projects[id] = Project({
            id: id,
            owner: msg.sender,
            title: title,
            description: description,
            requiredSkills: requiredSkills,
            capacity: capacity,
            acceptedCount: 0,
            active: true,
            createdAt: block.timestamp
        });
        emit ProjectCreated(id, msg.sender);
    }

    function applyToProject(uint256 projectId) external {
        Project storage project = _project(projectId);
        _checkActive(project);
        if (msg.sender == project.owner) revert OwnProject();
        if (applications[projectId][msg.sender].applicant != address(0)) revert DuplicateApplication();
        if (project.acceptedCount >= project.capacity) revert ProjectFull();

        applications[projectId][msg.sender] = Application(msg.sender, projectId, Status.Pending, block.timestamp);
        projectApplicants[projectId].push(msg.sender);
        userProjectIds[msg.sender].push(projectId);
        emit ApplicationSubmitted(projectId, msg.sender);
    }

    function acceptApplication(uint256 projectId, address applicant) external {
        Project storage project = _ownedActiveProject(projectId);
        Application storage application = _pendingApplication(projectId, applicant);
        if (project.acceptedCount >= project.capacity) revert ProjectFull();

        ++project.acceptedCount;
        application.status = Status.Accepted;
        emit ApplicationStatusChanged(projectId, applicant, msg.sender, Status.Accepted);
    }

    function rejectApplication(uint256 projectId, address applicant) external {
        _ownedActiveProject(projectId);
        Application storage application = _pendingApplication(projectId, applicant);
        application.status = Status.Rejected;
        emit ApplicationStatusChanged(projectId, applicant, msg.sender, Status.Rejected);
    }

    /// @notice Закрытие окончательно. Заявки в ожидании остаются в истории без решения.
    function closeProject(uint256 projectId) external {
        Project storage project = _ownedActiveProject(projectId);
        project.active = false;
        emit ProjectClosed(projectId, msg.sender);
    }

    function getProject(uint256 projectId) external view returns (Project memory) {
        return _project(projectId);
    }

    function getProjects(uint256 offset, uint256 limit) external view returns (Project[] memory result) {
        result = new Project[](_pageSize(projectCount, offset, limit));
        for (uint256 i = 0; i < result.length; ++i) {
            result[i] = projects[offset + i + 1];
        }
    }

    function getApplication(uint256 projectId, address applicant) external view returns (Application memory) {
        _project(projectId);
        return _application(projectId, applicant);
    }

    function getProjectApplications(uint256 projectId, uint256 offset, uint256 limit)
        external view returns (Application[] memory result)
    {
        _project(projectId);
        address[] storage applicants = projectApplicants[projectId];
        result = new Application[](_pageSize(applicants.length, offset, limit));
        for (uint256 i = 0; i < result.length; ++i) {
            result[i] = applications[projectId][applicants[offset + i]];
        }
    }

    function getUserApplications(address user, uint256 offset, uint256 limit)
        external view returns (Application[] memory result)
    {
        uint256[] storage ids = userProjectIds[user];
        result = new Application[](_pageSize(ids.length, offset, limit));
        for (uint256 i = 0; i < result.length; ++i) {
            result[i] = applications[ids[offset + i]][user];
        }
    }

    function _checkText(string calldata value, uint256 limit) private pure {
        bytes calldata data = bytes(value);
        if (data.length == 0 || data.length > limit) revert InvalidText();
        for (uint256 i = 0; i < data.length; ++i) {
            if (uint8(data[i]) > 32) return;
        }
        revert InvalidText();
    }

    function _project(uint256 projectId) private view returns (Project storage project) {
        project = projects[projectId];
        if (project.owner == address(0)) revert ProjectNotFound();
    }

    function _checkActive(Project storage project) private view {
        if (!project.active) revert ProjectInactive();
    }

    function _ownedActiveProject(uint256 projectId) private view returns (Project storage project) {
        project = _project(projectId);
        if (msg.sender != project.owner) revert OnlyProjectOwner();
        _checkActive(project);
    }

    function _application(uint256 projectId, address applicant) private view returns (Application storage application) {
        application = applications[projectId][applicant];
        if (application.applicant == address(0)) revert ApplicationNotFound();
    }

    function _pendingApplication(uint256 projectId, address applicant)
        private view returns (Application storage application)
    {
        application = _application(projectId, applicant);
        if (application.status != Status.Pending) revert FinalApplication();
    }

    function _pageSize(uint256 length, uint256 offset, uint256 limit) private pure returns (uint256) {
        if (limit == 0 || limit > MAX_PAGE_SIZE) revert InvalidPageSize();
        if (offset >= length) return 0;
        uint256 remaining = length - offset;
        return remaining < limit ? remaining : limit;
    }
}
